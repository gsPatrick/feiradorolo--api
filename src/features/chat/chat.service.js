'use strict';

/**
 * Serviço de chat: conversas entre comprador e vendedor e suas mensagens.
 * Integra moderação (blocked_words), realtime (Socket.io) e a aba
 * Chat/Moderação do admin (is_flagged / status).
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');

const OPEN_STATUSES = ['open', 'flagged'];

// Anti-spam: no máximo RATE_MAX mensagens por RATE_WINDOW_MS por remetente.
const RATE_WINDOW_MS = 30000;
const RATE_MAX = 5;
const rateBuckets = new Map(); // senderId -> [timestamps]

function checkRateLimit(senderId) {
  const now = Date.now();
  const recent = (rateBuckets.get(senderId) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    throw new AppError(
      'Você está enviando mensagens rápido demais. Aguarde alguns segundos.',
      429,
      'CHAT_RATE_LIMITED'
    );
  }
  recent.push(now);
  rateBuckets.set(senderId, recent);
}

function clampPage(value, fallback = 1) {
  return Math.max(1, Number(value) || fallback);
}

function clampLimit(value, fallback = 20) {
  return Math.max(1, Number(value) || fallback);
}

function isParticipant(chat, userId) {
  return chat.buyer_id === userId || chat.seller_id === userId;
}

/**
 * Encontra um chat aberto para a tupla (comprador, vendedor, produto) ou cria.
 */
async function getOrCreate({ buyerId, sellerId, productId = null, orderId = null } = {}) {
  if (!buyerId || !sellerId) {
    throw AppError.unprocessable('buyerId e sellerId são obrigatórios.', 'CHAT_PARTICIPANTS_REQUIRED');
  }
  if (buyerId === sellerId) {
    throw AppError.unprocessable('Comprador e vendedor não podem ser o mesmo usuário.', 'CHAT_SAME_PARTICIPANT');
  }

  const where = {
    buyer_id: buyerId,
    seller_id: sellerId,
    product_id: productId || null,
    status: { [Op.in]: OPEN_STATUSES },
  };

  const existing = await db.Chat.findOne({ where });
  if (existing) return existing;

  return db.Chat.create({
    buyer_id: buyerId,
    seller_id: sellerId,
    product_id: productId || null,
    order_id: orderId || null,
    status: 'open',
  });
}

/**
 * Lista os chats em que o usuário participa (comprador ou vendedor).
 */
async function listForUser(userId, { page = 1, limit = 20 } = {}) {
  const pageNum = clampPage(page);
  const limitNum = clampLimit(limit);
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await db.Chat.findAndCountAll({
    where: {
      [Op.or]: [{ buyer_id: userId }, { seller_id: userId }],
    },
    include: [
      { model: db.User, as: 'buyer', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.User, as: 'seller', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.Product, as: 'product', attributes: ['id', 'title', 'images', 'price', 'promotional_price'] },
    ],
    order: [
      ['last_message_at', 'DESC'],
      ['created_at', 'DESC'],
    ],
    limit: limitNum,
    offset,
  });

  return { rows, total: count };
}

/**
 * Retorna as mensagens de um chat (asc) e marca como lidas as endereçadas ao
 * usuário corrente (sender_id != userId).
 */
async function getMessages(chatId, userId, { page = 1, limit = 30, asAdmin = false } = {}) {
  const chat = await db.Chat.findByPk(chatId);
  if (!chat) throw AppError.notFound('Chat não encontrado.');
  if (!asAdmin && !isParticipant(chat, userId)) {
    throw AppError.forbidden('Você não participa deste chat.');
  }

  const pageNum = clampPage(page);
  const limitNum = clampLimit(limit, 30);
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await db.Message.findAndCountAll({
    where: { chat_id: chatId },
    include: [{ model: db.User, as: 'sender', attributes: ['id', 'name'] }],
    order: [['created_at', 'ASC']],
    limit: limitNum,
    offset,
  });

  // Admin apenas observando não marca as mensagens dos participantes como lidas.
  if (!asAdmin) {
    await db.Message.update(
      { is_read: true, read_at: new Date() },
      {
        where: {
          chat_id: chatId,
          sender_id: { [Op.ne]: userId },
          is_read: false,
        },
      }
    );
  }

  return { rows, total: count };
}

/** Lista TODAS as conversas (admin). Inclui participantes e produto. */
async function listAll({ page = 1, limit = 20, search } = {}) {
  const pageNum = clampPage(page);
  const limitNum = clampLimit(limit);
  const offset = (pageNum - 1) * limitNum;

  const where = {};
  if (search) {
    where.subject = { [Op.iLike]: `%${search}%` };
  }

  const { rows, count } = await db.Chat.findAndCountAll({
    where,
    include: [
      { model: db.User, as: 'buyer', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.User, as: 'seller', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.Product, as: 'product', attributes: ['id', 'title', 'images', 'price', 'promotional_price'] },
    ],
    order: [
      ['last_message_at', 'DESC'],
      ['created_at', 'DESC'],
    ],
    limit: limitNum,
    offset,
  });

  return { rows, total: count };
}

/**
 * Cria uma mensagem em um chat, aplicando moderação e emitindo eventos realtime.
 * Exportado explicitamente — a camada websocket também chama esta função.
 */
async function sendMessage({ chatId, senderId, content, type = 'text', attachments = null, asAdmin = false } = {}) {
  const chat = await db.Chat.findByPk(chatId);
  if (!chat) throw AppError.notFound('Chat não encontrado.');
  if (!asAdmin && !isParticipant(chat, senderId)) {
    throw AppError.forbidden('Você não participa deste chat.');
  }
  if (!asAdmin) checkRateLimit(senderId); // anti-spam: 5 msgs / 30s

  // Enforce de banimento / shadowban (apenas para participantes, não admin).
  let shadow = false;
  if (!asAdmin) {
    const userService = require('../user/user.service');
    const banScopes = await userService.getActiveBanScopes(senderId);
    if (banScopes.includes('chat') || banScopes.includes('full')) {
      throw AppError.forbidden('Você está impedido de usar o chat.', 'BANNED_CHAT');
    }
    // Shadowban: NÃO bloqueia — a mensagem é gravada e devolvida ao próprio
    // remetente, mas não é broadcastada ao outro participante.
    shadow = await userService.isShadowbanned(senderId);
  }

  const mod = await require('../../services/moderation.service').evaluate(content, 'chat');
  if (!mod.allowed) {
    throw AppError.unprocessable('Mensagem contém termos não permitidos', 'MESSAGE_BLOCKED');
  }

  const now = new Date();
  const isFlagged = mod.moderationStatus === 'flagged';
  // Mensagem de shadowban é marcada como 'flagged' (sombra) para a moderação.
  const moderationStatus = shadow ? 'flagged' : mod.moderationStatus;

  const message = await db.sequelize.transaction(async (transaction) => {
    const created = await db.Message.create(
      {
        chat_id: chatId,
        sender_id: senderId,
        type,
        content: mod.sanitized,
        attachments: attachments || null,
        moderation_status: moderationStatus,
        contains_blocked_words: mod.containsBlockedWords,
        flagged_reason: shadow ? 'shadowban' : mod.reason || null,
      },
      { transaction }
    );

    chat.last_message_at = now;
    if (isFlagged) {
      chat.is_flagged = true;
      chat.status = 'flagged';
    }
    await chat.save({ transaction });

    return created;
  });

  const plain = typeof message.toJSON === 'function' ? message.toJSON() : message;

  const io = require('../../realtime/io');

  // SHADOWBAN: não broadcast a terceiros. Entrega só ao próprio remetente para
  // que a UI dele mostre a mensagem como enviada.
  if (shadow) {
    io.emitToUser(senderId, 'message:new', plain);
    return plain;
  }

  // Destinatários: o outro participante; se for envio do admin (não-participante),
  // notifica ambos comprador e vendedor.
  const recipients = isParticipant(chat, senderId)
    ? [chat.buyer_id === senderId ? chat.seller_id : chat.buyer_id]
    : [chat.buyer_id, chat.seller_id];

  io.emitToChat(chatId, 'message:new', plain);
  recipients.filter(Boolean).forEach((recipientId) =>
    io.emitToUser(recipientId, 'chat:notify', {
      chat_id: chatId,
      message_id: plain.id,
      sender_id: senderId,
      type: plain.type,
      preview: plain.content,
      created_at: plain.created_at,
    })
  );

  return plain;
}

/** Marca um chat como sinalizado (moderação). */
async function flagChat(chatId) {
  const chat = await db.Chat.findByPk(chatId);
  if (!chat) throw AppError.notFound('Chat não encontrado.');
  chat.is_flagged = true;
  chat.status = 'flagged';
  await chat.save();
  return chat;
}

/** Encerra um chat (apenas participantes). */
async function closeChat(chatId, userId) {
  const chat = await db.Chat.findByPk(chatId);
  if (!chat) throw AppError.notFound('Chat não encontrado.');
  if (!isParticipant(chat, userId)) {
    throw AppError.forbidden('Você não participa deste chat.');
  }
  chat.status = 'closed';
  await chat.save();
  return chat;
}

/* --------------------------- Moderação (admin) ---------------------------- */

/** Lista chats sinalizados para a aba de moderação. */
async function listFlagged({ page = 1, limit = 20 } = {}) {
  const pageNum = clampPage(page);
  const limitNum = clampLimit(limit);
  const offset = (pageNum - 1) * limitNum;

  const { rows, count } = await db.Chat.findAndCountAll({
    where: { is_flagged: true },
    include: [
      { model: db.User, as: 'buyer', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.User, as: 'seller', attributes: ['id', 'name', 'avatar_url'] },
      { model: db.Product, as: 'product', attributes: ['id', 'title'] },
    ],
    order: [['last_message_at', 'DESC']],
    limit: limitNum,
    offset,
  });

  return { rows, total: count };
}

/** Override administrativo do status de moderação de uma mensagem. */
async function moderateMessage(messageId, { moderation_status } = {}) {
  const allowed = ['clean', 'flagged', 'blocked', 'reviewed'];
  if (!allowed.includes(moderation_status)) {
    throw AppError.unprocessable(
      "moderation_status deve ser 'clean', 'flagged', 'blocked' ou 'reviewed'.",
      'INVALID_MODERATION_STATUS'
    );
  }

  const message = await db.Message.findByPk(messageId);
  if (!message) throw AppError.notFound('Mensagem não encontrada.');

  message.moderation_status = moderation_status;
  await message.save();
  return message;
}

module.exports = {
  getOrCreate,
  listForUser,
  listAll,
  getMessages,
  sendMessage,
  flagChat,
  closeChat,
  listFlagged,
  moderateMessage,
};
