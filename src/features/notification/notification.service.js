'use strict';

/**
 * Serviço de Notificações (in-app + push). Push usa o provider configurável
 * (FCM/OneSignal). Conteúdo pode vir de message_templates (admin edita).
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const pushProvider = require('../../providers/push/push.provider');
const emailProvider = require('../../providers/email/email.provider');

function render(t, vars = {}) {
  return emailProvider.render(t, vars);
}

/** Registra/atualiza um token de dispositivo para push. */
async function registerDevice(userId, { token, platform = 'web', provider = 'fcm' }) {
  if (!token) throw AppError.badRequest('Token do dispositivo é obrigatório.', 'DEVICE_TOKEN_REQUIRED');
  const existing = await db.DeviceToken.findOne({ where: { token } });
  if (existing) {
    return existing.update({ user_id: userId, platform, provider, is_active: true, last_used_at: new Date() });
  }
  return db.DeviceToken.create({ user_id: userId, token, platform, provider, is_active: true, last_used_at: new Date() });
}

async function removeDevice(userId, token) {
  const device = await db.DeviceToken.findOne({ where: { token, user_id: userId } });
  if (device) await device.update({ is_active: false });
  return { removed: !!device };
}

async function listForUser(userId, { page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const { rows, count } = await db.Notification.findAndCountAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
  });
  return { rows, total: count };
}

async function markRead(id, userId) {
  const n = await db.Notification.findOne({ where: { id, user_id: userId } });
  if (!n) throw AppError.notFound('Notificação não encontrada.', 'NOTIFICATION_NOT_FOUND');
  await n.update({ status: 'read', read_at: new Date() });
  return n;
}

async function markAllRead(userId) {
  const [count] = await db.Notification.update(
    { status: 'read', read_at: new Date() },
    { where: { user_id: userId, status: ['pending', 'sent', 'delivered'] } }
  );
  return { updated: count };
}

/**
 * Cria uma notificação e dispara o canal escolhido. Best-effort no push:
 * registra status sent/failed sem quebrar o fluxo de negócio.
 */
async function notifyUser(userId, { type, title, body, data = null, channel = 'push', templateKey = null, vars = {} }) {
  let finalTitle = title;
  let finalBody = body;
  if (templateKey) {
    const tpl = await db.MessageTemplate.findOne({ where: { key: templateKey, channel: 'push', locale: 'pt-BR', is_active: true } });
    if (tpl) {
      finalTitle = render(tpl.title || tpl.subject || title, vars);
      finalBody = render(tpl.body, vars);
    }
  }

  const notification = await db.Notification.create({
    user_id: userId,
    type: type || 'generic',
    channel,
    title: finalTitle || 'Notificação',
    body: finalBody || null,
    data,
    status: 'pending',
  });

  let delivered = false;
  if (channel === 'push') {
    try {
      const devices = await db.DeviceToken.findAll({ where: { user_id: userId, is_active: true } });
      const tokens = devices.map((d) => d.token);
      const result = await pushProvider.send({ tokens, externalUserIds: [userId], title: finalTitle, body: finalBody, data });
      delivered = !result.skipped;
      await notification.update({
        status: result.skipped ? 'pending' : 'sent',
        sent_at: result.skipped ? null : new Date(),
        provider: result.provider || null,
        data: { ...(data || {}), delivery: result },
      });
    } catch (err) {
      logger.error(`notifyUser: push falhou para ${userId}:`, err.message);
      await notification.update({ status: 'failed' });
    }
  }

  // Entrega em tempo real via WebSocket (in-app). Fallback quando não há provider
  // de push conectado — o sino do app recebe na hora mesmo assim.
  emitRealtime(userId, notification, finalTitle, finalBody);
  if (!delivered && channel === 'push') {
    // marca como enviada via socket (in-app) para não ficar eternamente 'pending'.
    notification.update({ status: 'sent', sent_at: new Date(), provider: 'socket' }).catch(() => {});
  }

  return notification;
}

/** Emite a notificação ao usuário via Socket.io (canal in-app). */
function emitRealtime(userId, notification, title, body) {
  try {
    const io = require('../../realtime/io');
    io.emitToUser(userId, 'notification:new', {
      id: notification.id,
      type: notification.type,
      title,
      body,
      created_at: notification.created_at,
    });
  } catch (e) {
    // socket indisponível (ex.: contexto sem servidor) — ignora
  }
}

/** Envio de teste (valida a configuração do provider de push). */
async function sendTest(userId) {
  return notifyUser(userId, {
    type: 'test',
    title: 'Notificação de teste',
    body: 'Se você recebeu isto, o push está configurado corretamente.',
    channel: 'push',
  });
}

/** Admin: lista TODAS as notificações (paginado, com destinatário). */
async function adminList({ page = 1, limit = 30 } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 30));
  const { rows, count } = await db.Notification.findAndCountAll({
    include: [{ model: db.User, as: 'user', attributes: ['id', 'name', 'email'] }],
    order: [['created_at', 'DESC']],
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  });
  return { rows, total: count };
}

/** Admin: envia notificação para um usuário ou faz broadcast (todos). */
async function adminCreate({ type = 'system', title, body, channel = 'in_app', userId = null } = {}) {
  if (!title) throw require('../../utils/AppError').unprocessable('title é obrigatório.', 'NOTIF_TITLE_REQUIRED');
  if (userId) {
    return notifyUser(userId, { type, title, body, channel });
  }
  const users = await db.User.findAll({ attributes: ['id'], raw: true });
  const now = new Date();
  const rows = users.map((u) => ({
    user_id: u.id,
    type,
    channel: 'in_app',
    title,
    body: body || null,
    provider: 'internal',
    status: 'sent',
    sent_at: now,
  }));
  if (rows.length) {
    const created = await db.Notification.bulkCreate(rows, { returning: true });
    // Entrega em tempo real (in-app) para cada usuário via socket.
    created.forEach((n) => emitRealtime(n.user_id, n, n.title, n.body));
  }
  return { broadcast: true, count: rows.length };
}

/** Admin: remove uma notificação. */
async function adminDelete(id) {
  const n = await db.Notification.findByPk(id);
  if (!n) throw require('../../utils/AppError').notFound('Notificação não encontrada.', 'NOTIF_NOT_FOUND');
  await n.destroy();
}

/** Admin: limpa todo o histórico de notificações. Retorna a contagem removida. */
async function adminClearAll() {
  return db.Notification.destroy({ where: {}, truncate: false });
}

module.exports = {
  registerDevice, removeDevice, listForUser, markRead, markAllRead, notifyUser, sendTest,
  adminList, adminCreate, adminDelete, adminClearAll,
};
