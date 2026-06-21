'use strict';

/**
 * Serviço de Devolução/Disputa.
 *
 * Fluxo: o comprador solicita a devolução de um pedido pago (questionário +
 * fotos). Se o dinheiro ainda está em custódia (escrow 'held', dentro da janela
 * de 7 dias), a devolução é AUTO-APROVADA (baixo risco) e estornada na hora.
 * Caso contrário, fica pendente da decisão do vendedor (aprovar/contestar) e,
 * em caso de contestação, vai para mediação do admin.
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');
const accountService = require('../payment/payment-account.service');
const notification = require('../notification/notification.service');

const REASONS = ['not_received', 'not_as_described', 'damaged', 'fraud', 'other'];
const OPEN_STATUSES = ['open', 'under_review', 'awaiting_response'];

function notifySafe(userId, payload) {
  try {
    const p = notification.notifyUser(userId, payload);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) {
    /* best-effort: notificação nunca quebra o fluxo de negócio */
  }
}

/* --------------------------- comprador: solicitar -------------------------- */

/**
 * Solicita a devolução de um pedido pago.
 * @param {string} orderId
 * @param {object} buyer  req.user (comprador autenticado)
 * @param {object} body   { reason, description, product_state, evidence }
 */
async function requestReturn(orderId, buyer, { reason, description, product_state, evidence } = {}) {
  if (!reason || !REASONS.includes(reason)) {
    throw AppError.unprocessable(`reason inválido. Valores: ${REASONS.join(', ')}.`, 'INVALID_DISPUTE_REASON');
  }

  const dispute = await db.sequelize.transaction(async (tx) => {
    const order = await db.Order.findByPk(orderId, { transaction: tx });
    if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
    if (order.buyer_id !== buyer.id) {
      throw AppError.forbidden('Apenas o comprador pode solicitar a devolução.', 'NOT_ORDER_BUYER');
    }
    // Só pedidos pagos (pagos/entregues) são elegíveis para devolução.
    const eligible = ['paid', 'processing', 'shipped', 'delivered'];
    const isPaid = order.payment_status === 'paid';
    if (!isPaid && !eligible.includes(order.status)) {
      throw AppError.conflict('Este pedido não está elegível para devolução.', 'ORDER_NOT_RETURNABLE');
    }

    const existing = await db.Dispute.findOne({
      where: { order_id: orderId, status: { [Op.in]: OPEN_STATUSES } },
      transaction: tx,
    });
    if (existing) {
      throw AppError.conflict('Já existe uma devolução/disputa aberta para este pedido.', 'DISPUTE_ALREADY_OPEN');
    }

    const photos = Array.isArray(evidence) ? evidence : [];
    const dispute = await db.Dispute.create(
      {
        order_id: order.id,
        opened_by: buyer.id,
        against_id: order.seller_id,
        reason,
        description: description || null,
        status: 'open',
        amount_disputed: order.total,
        // evidence (JSONB): fotos + questionário do estado do produto.
        evidence: { photos, questionnaire: product_state || null },
      },
      { transaction: tx }
    );

    await order.update({ status: 'disputed' }, { transaction: tx });

    return dispute;
  });

  // Notifica o vendedor da solicitação.
  const order = await db.Order.findByPk(orderId);
  notifySafe(order.seller_id, {
    type: 'dispute',
    channel: 'in_app',
    title: 'Pedido com solicitação de devolução',
    body: `O comprador solicitou devolução do pedido ${order.order_number}.`,
    data: { order_id: order.id, dispute_id: dispute.id },
  });

  // Auto-aprovação: se o escrow ainda está retido (dinheiro não repassado,
  // dentro da janela), devolve automaticamente (baixo risco).
  let escrow = null;
  try {
    escrow = await db.Escrow.findOne({ where: { order_id: order.id } });
  } catch (e) {
    /* sem escrow não impede o fluxo pendente */
  }
  if (escrow && escrow.status === 'held') {
    await _refund(order, dispute, { reason: 'auto_within_window' });
  }

  return db.Dispute.findByPk(dispute.id);
}

/* ----------------------------- vendedor: decisão --------------------------- */

/** Vendedor aprova a devolução -> reembolso ao comprador. */
async function approveReturn(disputeId, seller) {
  const dispute = await db.Dispute.findByPk(disputeId);
  if (!dispute) throw AppError.notFound('Disputa não encontrada.', 'DISPUTE_NOT_FOUND');
  if (dispute.against_id !== seller.id) {
    throw AppError.forbidden('Apenas o vendedor do pedido pode aprovar a devolução.', 'NOT_ORDER_SELLER');
  }
  if (dispute.status === 'resolved') {
    throw AppError.conflict('Disputa já resolvida.', 'DISPUTE_ALREADY_RESOLVED');
  }
  const order = await db.Order.findByPk(dispute.order_id);
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');

  await _refund(order, dispute, { reason: 'seller_approved' });
  return db.Dispute.findByPk(dispute.id);
}

/**
 * Vendedor contesta a devolução -> vira disputa para mediação do admin.
 * Notifica o comprador.
 */
async function rejectReturn(disputeId, seller, { notes } = {}) {
  const dispute = await db.Dispute.findByPk(disputeId);
  if (!dispute) throw AppError.notFound('Disputa não encontrada.', 'DISPUTE_NOT_FOUND');
  if (dispute.against_id !== seller.id) {
    throw AppError.forbidden('Apenas o vendedor do pedido pode contestar.', 'NOT_ORDER_SELLER');
  }
  if (dispute.status === 'resolved' || dispute.status === 'rejected') {
    throw AppError.conflict('Esta disputa não pode mais ser contestada.', 'DISPUTE_NOT_OPEN');
  }

  await dispute.update({ status: 'under_review', resolution_notes: notes || null });

  const order = await db.Order.findByPk(dispute.order_id);
  notifySafe(dispute.opened_by, {
    type: 'dispute',
    channel: 'in_app',
    title: 'Devolução contestada',
    body: `O vendedor contestou sua solicitação de devolução do pedido ${order ? order.order_number : ''}. Um mediador irá analisar o caso.`,
    data: { order_id: dispute.order_id, dispute_id: dispute.id },
  });

  return dispute;
}

/* ------------------------------- reembolso (interno) ----------------------- */

/**
 * Executa o reembolso ao comprador: estorna no Mercado Pago, atualiza Payment,
 * Order, Dispute e Escrow, e notifica ambas as partes.
 * @param {number|null} amount  valor parcial; null = total.
 */
async function _refund(order, dispute, { reason, amount = null } = {}) {
  const refundAmount = amount != null ? Number(amount) : (dispute.amount_disputed != null ? Number(dispute.amount_disputed) : null);

  // Localiza o pagamento aprovado/autorizado do pedido (o mais recente com external_id).
  const payment = await db.Payment.findOne({
    where: { order_id: order.id, status: { [Op.in]: ['approved', 'authorized'] } },
    order: [['created_at', 'DESC']],
  });

  // Estorno no gateway (token do vendedor para o split). refundPayment já lança
  // AppError MP_REFUND_ERROR; propagamos com mensagem amigável.
  if (payment && payment.external_id) {
    try {
      const sellerToken = await accountService.getActiveAccessToken(order.seller_id);
      await mercadopago.refundPayment(payment.external_id, refundAmount, sellerToken);
    } catch (err) {
      logger.error(`_refund: falha ao estornar pagamento ${payment.external_id}:`, err.message);
      throw new AppError(
        'Não foi possível processar o estorno no provedor de pagamento. Tente novamente em instantes.',
        502,
        'REFUND_FAILED',
        err.details || null
      );
    }
  }

  await db.sequelize.transaction(async (tx) => {
    if (payment) await payment.update({ status: 'refunded' }, { transaction: tx });

    await order.update(
      { status: 'refunded', payment_status: 'refunded' },
      { transaction: tx }
    );

    // Escrow: marca como reembolsado (NÃO liberar ao vendedor). Estorna a comissão.
    const escrow = await db.Escrow.findOne({ where: { order_id: order.id }, transaction: tx });
    if (escrow && escrow.status !== 'released') {
      await escrow.update({ status: 'refunded', release_reason: `refund: ${reason}` }, { transaction: tx });
    }

    await dispute.update(
      {
        status: 'resolved',
        resolution: amount != null ? 'partial_refund' : 'refund_buyer',
        amount_disputed: refundAmount != null ? refundAmount : dispute.amount_disputed,
        resolved_at: new Date(),
        resolution_notes: dispute.resolution_notes || `Estorno (${reason}).`,
      },
      { transaction: tx }
    );
  });

  // Notifica comprador e vendedor do reembolso.
  const valor = refundAmount != null ? `R$ ${Number(refundAmount).toFixed(2)}` : 'o valor do pedido';
  notifySafe(order.buyer_id, {
    type: 'dispute',
    channel: 'in_app',
    title: 'Devolução aprovada',
    body: `Seu reembolso de ${valor} referente ao pedido ${order.order_number} foi processado.`,
    data: { order_id: order.id, dispute_id: dispute.id },
  });
  notifySafe(order.seller_id, {
    type: 'dispute',
    channel: 'in_app',
    title: 'Devolução processada',
    body: `O pedido ${order.order_number} foi reembolsado ao comprador.`,
    data: { order_id: order.id, dispute_id: dispute.id },
  });

  return dispute;
}

/* -------------------------------- admin: mediar ---------------------------- */

/**
 * Admin media a disputa.
 * - refund_buyer   -> _refund total
 * - partial_refund -> _refund com amount
 * - release_seller -> libera a custódia normalmente ao vendedor
 */
async function resolve(disputeId, admin, { resolution, amount, notes } = {}) {
  const valid = ['refund_buyer', 'partial_refund', 'release_seller'];
  if (!resolution || !valid.includes(resolution)) {
    throw AppError.unprocessable(`resolution inválido. Valores: ${valid.join(', ')}.`, 'INVALID_RESOLUTION');
  }

  const dispute = await db.Dispute.findByPk(disputeId);
  if (!dispute) throw AppError.notFound('Disputa não encontrada.', 'DISPUTE_NOT_FOUND');
  if (dispute.status === 'resolved') {
    throw AppError.conflict('Disputa já resolvida.', 'DISPUTE_ALREADY_RESOLVED');
  }
  const order = await db.Order.findByPk(dispute.order_id);
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');

  await dispute.update({
    assigned_admin_id: dispute.assigned_admin_id || admin.id,
    resolved_by: admin.id,
    resolution_notes: notes || dispute.resolution_notes || null,
  });

  if (resolution === 'refund_buyer') {
    await _refund(order, dispute, { reason: 'admin_refund' });
  } else if (resolution === 'partial_refund') {
    if (amount == null || Number(amount) <= 0) {
      throw AppError.unprocessable('amount é obrigatório para reembolso parcial.', 'AMOUNT_REQUIRED');
    }
    await _refund(order, dispute, { reason: 'admin_partial_refund', amount: Number(amount) });
  } else {
    // release_seller: libera a custódia normalmente.
    await db.sequelize.transaction(async (tx) => {
      const escrow = await db.Escrow.findOne({ where: { order_id: order.id }, transaction: tx });
      if (escrow && ['held', 'disputed'].includes(escrow.status)) {
        await escrow.update(
          { status: 'released', released_at: new Date(), released_by: admin.id, release_reason: 'dispute_resolved_seller' },
          { transaction: tx }
        );
      }
      await order.update({ status: 'completed', completed_at: new Date() }, { transaction: tx });
      await dispute.update(
        { status: 'resolved', resolution: 'release_seller', resolved_at: new Date() },
        { transaction: tx }
      );
    });
    notifySafe(order.seller_id, {
      type: 'dispute',
      channel: 'in_app',
      title: 'Disputa resolvida a seu favor',
      body: `A disputa do pedido ${order.order_number} foi encerrada e o valor foi liberado.`,
      data: { order_id: order.id, dispute_id: dispute.id },
    });
    notifySafe(order.buyer_id, {
      type: 'dispute',
      channel: 'in_app',
      title: 'Disputa encerrada',
      body: `A disputa do pedido ${order.order_number} foi resolvida em favor do vendedor.`,
      data: { order_id: order.id, dispute_id: dispute.id },
    });
  }

  return db.Dispute.findByPk(dispute.id);
}

/* --------------------------------- consultas ------------------------------- */

const DISPUTE_INCLUDE = [
  { model: db.Order, as: 'order', attributes: ['id', 'order_number', 'status', 'total', 'buyer_id', 'seller_id'] },
  { model: db.User, as: 'claimant', attributes: ['id', 'name'] },
  { model: db.User, as: 'respondent', attributes: ['id', 'name'] },
];

/** Lista as disputas em que o usuário é comprador ou vendedor. */
async function listMine(user) {
  return db.Dispute.findAll({
    where: { [Op.or]: [{ opened_by: user.id }, { against_id: user.id }] },
    include: DISPUTE_INCLUDE,
    order: [['created_at', 'DESC']],
  });
}

/** Detalhe de uma disputa (acessível ao comprador, vendedor ou admin). */
async function getById(id, user) {
  const dispute = await db.Dispute.findByPk(id, { include: DISPUTE_INCLUDE });
  if (!dispute) throw AppError.notFound('Disputa não encontrada.', 'DISPUTE_NOT_FOUND');
  const involved = dispute.opened_by === user.id || dispute.against_id === user.id;
  if (!involved && !user.is_admin) {
    throw AppError.forbidden('Você não tem acesso a esta disputa.', 'DISPUTE_FORBIDDEN');
  }
  return dispute;
}

/** Admin: lista todas as disputas (mediação). */
async function listAdmin({ page = 1, limit = 30, status } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 30));
  const where = {};
  if (status) where.status = status;
  const { rows, count } = await db.Dispute.findAndCountAll({
    where,
    include: DISPUTE_INCLUDE,
    order: [['created_at', 'DESC']],
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  });
  return { rows, total: count };
}

module.exports = {
  requestReturn,
  approveReturn,
  rejectReturn,
  resolve,
  listMine,
  getById,
  listAdmin,
  _refund,
};
