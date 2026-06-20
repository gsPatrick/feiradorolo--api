'use strict';

/**
 * Serviço de Denúncias. Usuários denunciam conteúdo (perguntas, mensagens,
 * produtos…); o admin aprova (remove/oculta o conteúdo) ou rejeita.
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');

const TARGET_TYPES = ['question', 'message', 'product', 'review', 'user', 'chat'];
const REASONS = ['spam', 'offensive', 'inappropriate', 'fraud', 'external_contact', 'other'];

/** Captura um resumo do alvo para o admin ver sem precisar de joins. */
async function buildSnapshot(targetType, targetId) {
  try {
    if (targetType === 'question') {
      const q = await db.ProductQuestion.findByPk(targetId, {
        include: [
          { model: db.User, as: 'asker', attributes: ['id', 'name'] },
          { model: db.Product, as: 'product', attributes: ['id', 'title'] },
        ],
      });
      if (q) {
        return { text: q.question, authorName: q.asker ? q.asker.name : null, productName: q.product ? q.product.title : null };
      }
    } else if (targetType === 'message') {
      const m = await db.Message.findByPk(targetId, {
        include: [{ model: db.User, as: 'sender', attributes: ['id', 'name'] }],
      });
      if (m) return { text: m.content, authorName: m.sender ? m.sender.name : null };
    } else if (targetType === 'product') {
      const p = await db.Product.findByPk(targetId, {
        include: [{ model: db.User, as: 'seller', attributes: ['id', 'name'] }],
      });
      if (p) return { text: p.title, authorName: p.seller ? p.seller.name : null, productName: p.title };
    } else if (targetType === 'review') {
      const r = await db.Review.findByPk(targetId);
      if (r) return { text: r.comment || null };
    } else if (targetType === 'user') {
      const u = await db.User.findByPk(targetId, { attributes: ['id', 'name'] });
      if (u) return { authorName: u.name };
    }
  } catch (e) {
    /* snapshot é best-effort */
  }
  return null;
}

async function create(reporterId, { target_type, target_id, reason, description } = {}) {
  if (!TARGET_TYPES.includes(target_type)) {
    throw AppError.unprocessable('target_type inválido.', 'INVALID_TARGET_TYPE');
  }
  if (!target_id) throw AppError.unprocessable('target_id é obrigatório.', 'TARGET_ID_REQUIRED');
  const finalReason = REASONS.includes(reason) ? reason : 'other';

  // Evita denúncia duplicada pendente do mesmo usuário sobre o mesmo alvo.
  const existing = await db.Report.findOne({
    where: { reporter_id: reporterId, target_type, target_id, status: 'pending' },
  });
  if (existing) return existing;

  const snapshot = await buildSnapshot(target_type, target_id);
  return db.Report.create({
    reporter_id: reporterId || null,
    target_type,
    target_id,
    reason: finalReason,
    description: description || null,
    snapshot,
    status: 'pending',
  });
}

async function adminList({ status, page = 1, limit = 50 } = {}) {
  const where = {};
  if (status) where.status = status;
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
  const { rows, count } = await db.Report.findAndCountAll({
    where,
    include: [{ model: db.User, as: 'reporter', attributes: ['id', 'name', 'email'] }],
    order: [['created_at', 'DESC']],
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  });
  return { rows, total: count };
}

/**
 * Resolve a denúncia. `status='approved'` aplica a ação no conteúdo
 * (oculta a pergunta / bloqueia a mensagem / inativa o produto).
 */
async function adminResolve(id, { status, resolution } = {}, adminId) {
  if (!['approved', 'rejected'].includes(status)) {
    throw AppError.unprocessable("status deve ser 'approved' ou 'rejected'.", 'INVALID_STATUS');
  }
  const report = await db.Report.findByPk(id);
  if (!report) throw AppError.notFound('Denúncia não encontrada.', 'REPORT_NOT_FOUND');

  if (status === 'approved') {
    try {
      if (report.target_type === 'question') {
        await db.ProductQuestion.update({ status: 'hidden' }, { where: { id: report.target_id } });
      } else if (report.target_type === 'message') {
        await db.Message.update({ moderation_status: 'blocked' }, { where: { id: report.target_id } });
      } else if (report.target_type === 'product') {
        await db.Product.update({ status: 'inactive' }, { where: { id: report.target_id } });
      }
    } catch (e) {
      /* a ação no conteúdo é best-effort; a denúncia ainda é resolvida */
    }
  }

  await report.update({
    status,
    resolution: resolution || null,
    resolved_by: adminId || null,
    resolved_at: new Date(),
  });
  return report;
}

module.exports = { create, adminList, adminResolve };
