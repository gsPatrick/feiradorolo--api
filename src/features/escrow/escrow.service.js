'use strict';

/**
 * Serviço de Escrow (custódia). Retém o valor líquido do vendedor por N dias
 * (default 7, regras/3) e o libera quando o comprador confirma o recebimento
 * ou quando o prazo vence sem disputa aberta.
 *
 * IMPORTANTE: o payment.service depende de `createForOrder` e o scheduler
 * depende de `releaseDue`. Os nomes exportados são contratuais.
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const settings = require('../../services/settings.cache');
const { emitToUser } = require('../../realtime/io');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

/**
 * Cria a custódia para um pedido pago. Idempotente: se já existe escrow para o
 * pedido, retorna o existente.
 */
async function createForOrder(order, payment, options = {}) {
  const tx = options.transaction || null;

  const existing = await db.Escrow.findOne({ where: { order_id: order.id }, transaction: tx });
  if (existing) return existing;

  // Carrega o primeiro item para resolver categoria (snapshot já está no pedido).
  let categoryId = null;
  const firstItem = await db.OrderItem.findOne({
    where: { order_id: order.id },
    include: [{ model: db.Product, as: 'product', attributes: ['category_id'] }],
    transaction: tx,
  });
  if (firstItem && firstItem.product) categoryId = firstItem.product.category_id;

  const sellerUser = await db.User.findByPk(order.seller_id, { transaction: tx });
  const resolved = await settings.resolveCommission({
    categoryId,
    sellerTier: sellerUser ? sellerUser.seller_tier : 'standard',
  });

  const subtotal = Number(order.subtotal || 0);
  const commissionAmount = Number(order.commission_amount != null ? order.commission_amount : 0);
  const amount =
    order.seller_amount != null ? Number(order.seller_amount) : round2(subtotal - commissionAmount);

  const holdDays = resolved.escrowHoldDays != null ? Number(resolved.escrowHoldDays) : 7;
  const now = new Date();
  const releaseDueAt = new Date(now.getTime() + holdDays * 24 * 60 * 60 * 1000);

  // Retirada presencial: gera token numérico de 6 dígitos para liberação no encontro.
  const pickupToken =
    order.delivery_method === 'pickup' ? String(Math.floor(100000 + Math.random() * 900000)) : null;

  const escrow = await db.Escrow.create(
    {
      order_id: order.id,
      payment_id: payment.id,
      seller_id: order.seller_id,
      amount,
      currency: order.currency || 'BRL',
      status: 'held',
      hold_days: holdDays,
      held_at: now,
      release_due_at: releaseDueAt,
      pickup_token: pickupToken,
    },
    { transaction: tx }
  );

  // Notificações de retirada presencial (token + alerta de segurança).
  if (pickupToken) {
    try {
      const notify = require('../notification/notification.service');
      notify.notifyUser(order.buyer_id, {
        type: 'escrow.pickup_token',
        channel: 'in_app',
        title: 'Código de retirada',
        body: `Seu código é ${pickupToken}. Informe-o ao vendedor SOMENTE ao receber o produto. ⚠️ Combine a retirada em local público e movimentado.`,
      }).catch(() => {});
      notify.notifyUser(order.seller_id, {
        type: 'escrow.pickup_token',
        channel: 'in_app',
        title: 'Retirada presencial',
        body: 'Peça o código de 6 dígitos ao comprador no momento da entrega para liberar o pagamento. ⚠️ Encontre-se em local público e movimentado.',
      }).catch(() => {});
    } catch (e) {
      /* best-effort */
    }
  }

  return escrow;
}

/**
 * Liberação por token presencial: o vendedor informa o código de 6 dígitos que o
 * comprador revela no encontro, liberando a custódia.
 */
async function releaseByToken(orderId, sellerId, token) {
  return db.sequelize.transaction(async (tx) => {
    const escrow = await db.Escrow.findOne({ where: { order_id: orderId }, transaction: tx });
    if (!escrow) throw AppError.notFound('Custódia não encontrada.', 'ESCROW_NOT_FOUND');
    const order = await db.Order.findByPk(orderId, { transaction: tx });
    if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
    if (order.seller_id !== sellerId) {
      throw AppError.forbidden('Apenas o vendedor pode liberar por token.', 'NOT_ORDER_SELLER');
    }
    if (escrow.status !== 'held') throw AppError.conflict('A custódia não está mais retida.', 'ESCROW_NOT_HELD');
    if (!escrow.pickup_token) {
      throw AppError.unprocessable('Este pedido não é de retirada presencial.', 'NO_PICKUP_TOKEN');
    }
    if (String(token || '').trim() !== escrow.pickup_token) {
      throw AppError.unprocessable('Código de retirada inválido.', 'INVALID_PICKUP_TOKEN');
    }

    await _release(escrow, order, { releasedBy: sellerId, reason: 'pickup_token' }, tx);
    emitToUser(order.buyer_id, 'order:completed', { order_id: order.id });
    return escrow;
  });
}

/** Libera a custódia e marca o pedido como concluído (uso interno). */
async function _release(escrow, order, { releasedBy, reason }, tx) {
  // Repasse efetivo: se o pagamento foi autorizado e está retido no gateway
  // (estratégia mp_capture), captura agora para liberar o dinheiro ao vendedor.
  try {
    const paymentService = require('../payment/payment.service');
    await paymentService.captureForOrder(order.id);
  } catch (e) {
    /* best-effort: a liberação contábil ocorre mesmo se a captura falhar */
  }

  await escrow.update(
    {
      status: 'released',
      released_at: new Date(),
      released_by: releasedBy || null,
      release_reason: reason,
    },
    { transaction: tx }
  );
  await order.update(
    { status: 'completed', completed_at: new Date() },
    { transaction: tx }
  );
}

/**
 * Liberação manual: o comprador confirma o recebimento do pedido.
 * Apenas o comprador do pedido pode liberar, e somente se a custódia está retida.
 */
async function releaseManual(orderId, buyerId) {
  return db.sequelize.transaction(async (tx) => {
    const escrow = await db.Escrow.findOne({ where: { order_id: orderId }, transaction: tx });
    if (!escrow) throw AppError.notFound('Custódia não encontrada para este pedido.', 'ESCROW_NOT_FOUND');

    const order = await db.Order.findByPk(orderId, { transaction: tx });
    if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
    if (order.buyer_id !== buyerId) {
      throw AppError.forbidden('Apenas o comprador pode confirmar o recebimento.', 'NOT_ORDER_BUYER');
    }
    if (escrow.status !== 'held') {
      throw AppError.conflict('A custódia não está mais retida.', 'ESCROW_NOT_HELD');
    }

    await _release(escrow, order, { releasedBy: buyerId, reason: 'buyer_confirmed' }, tx);

    emitToUser(order.seller_id, 'escrow:released', { order_id: order.id, escrow_id: escrow.id, reason: 'buyer_confirmed' });
    emitToUser(order.buyer_id, 'order:completed', { order_id: order.id });

    return escrow;
  });
}

/**
 * Liberação automática (cron): custódias retidas cujo prazo venceu e sem disputa
 * aberta no pedido. Retorna o array de custódias liberadas.
 */
async function releaseDue() {
  const due = await db.Escrow.findAll({
    where: { status: 'held', release_due_at: { [Op.lte]: new Date() } },
  });

  const released = [];
  for (const escrow of due) {
    // Retirada presencial: só libera com o token informado pelo vendedor (não auto).
    if (escrow.pickup_token) continue;

    const openDispute = await db.Dispute.count({
      where: {
        order_id: escrow.order_id,
        status: { [Op.in]: ['open', 'under_review', 'awaiting_response'] },
      },
    });
    if (openDispute > 0) continue;

    await db.sequelize.transaction(async (tx) => {
      const order = await db.Order.findByPk(escrow.order_id, { transaction: tx });
      if (!order) return;
      // Pedido retido até verificação facial do comprador — não libera.
      if (order.held_for_buyer_verification) return;
      // Recarrega dentro da transação para evitar corrida.
      const fresh = await db.Escrow.findByPk(escrow.id, { transaction: tx });
      if (!fresh || fresh.status !== 'held') return;
      await _release(fresh, order, { releasedBy: null, reason: 'auto_7_days' }, tx);
      released.push(fresh);

      emitToUser(order.seller_id, 'escrow:released', { order_id: order.id, escrow_id: fresh.id, reason: 'auto_7_days' });
      emitToUser(order.buyer_id, 'order:completed', { order_id: order.id });
    });
  }

  return released;
}

async function getByOrder(orderId, userId) {
  const escrow = await db.Escrow.findOne({ where: { order_id: orderId } });
  if (!escrow) throw AppError.notFound('Custódia não encontrada para este pedido.', 'ESCROW_NOT_FOUND');
  const order = await db.Order.findByPk(orderId, { attributes: ['buyer_id'] });
  const plain = typeof escrow.toJSON === 'function' ? escrow.toJSON() : escrow;
  // O token de retirada só é visível ao comprador (que o revela ao vendedor no encontro).
  if (!order || order.buyer_id !== userId) plain.pickup_token = null;
  return plain;
}

/** Lista custódias retidas (uso admin). */
async function listHeld({ page = 1, limit = 20 } = {}) {
  const offset = (Number(page) - 1) * Number(limit);
  const { rows, count } = await db.Escrow.findAndCountAll({
    where: { status: 'held' },
    include: [{ model: db.Order, as: 'order' }],
    order: [['release_due_at', 'ASC']],
    limit: Number(limit),
    offset,
  });
  return { rows, total: count };
}

module.exports = {
  createForOrder,
  releaseManual,
  releaseByToken,
  releaseDue,
  getByOrder,
  listHeld,
};
