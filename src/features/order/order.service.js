'use strict';

/**
 * Serviço de Pedidos (marketplace). Um pedido por VENDEDOR (carrinho com itens
 * de vários vendedores gera múltiplos pedidos). Guarda snapshots financeiros
 * (comissão/split) para auditoria. Também conecta disputas (regras/3).
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const settings = require('../../services/settings.cache');
const { emitToUser } = require('../../realtime/io');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const DISPUTE_REASONS = ['not_received', 'not_as_described', 'damaged', 'fraud', 'other'];

/** Gera um número de pedido único e legível: FR + timestamp base36 + aleatório. */
function generateOrderNumber() {
  const ts = Date.now().toString(36).toUpperCase();
  const rnd = Math.floor(Math.random() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, '0');
  return `FR${ts}${rnd}`;
}

/**
 * Checkout: carrega produtos, agrupa por vendedor e cria um pedido por vendedor.
 * @param {string} buyerId
 * @param {object} payload { items:[{product_id, quantity, variation}], shipping_address, shipping_option }
 * @returns {Promise<Array>} pedidos criados (com itens)
 */
async function checkout(buyerId, payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (!items.length) throw AppError.unprocessable('Informe ao menos um item.', 'CHECKOUT_NO_ITEMS');

  const productIds = [...new Set(items.map((i) => i.product_id).filter(Boolean))];
  if (!productIds.length) throw AppError.unprocessable('Itens inválidos.', 'CHECKOUT_INVALID_ITEMS');

  const products = await db.Product.findAll({ where: { id: { [Op.in]: productIds } } });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Valida e agrupa itens por vendedor.
  const groups = new Map(); // seller_id -> [{ product, quantity, variation }]
  for (const item of items) {
    const product = productMap.get(item.product_id);
    if (!product) throw AppError.notFound(`Produto ${item.product_id} não encontrado.`, 'PRODUCT_NOT_FOUND');
    if (product.status !== 'active') {
      throw AppError.conflict(`Produto "${product.title}" não está disponível.`, 'PRODUCT_NOT_AVAILABLE');
    }
    if (product.seller_id === buyerId) {
      throw AppError.badRequest('Você não pode comprar o seu próprio produto.', 'CANNOT_BUY_OWN_PRODUCT');
    }
    const quantity = Math.max(1, Number(item.quantity) || 1);
    if (product.stock != null && quantity > product.stock) {
      throw AppError.conflict(`Estoque insuficiente para "${product.title}".`, 'INSUFFICIENT_STOCK');
    }
    if (!groups.has(product.seller_id)) groups.set(product.seller_id, []);
    groups.get(product.seller_id).push({ product, quantity, variation: item.variation || null });
  }

  const shippingOption = payload.shipping_option || null;
  const shippingAddress = payload.shipping_address || null;
  const deliveryMethod = payload.delivery_method === 'pickup' ? 'pickup' : 'shipping';

  // Retirada presencial só é aceita quando TODOS os produtos do checkout a permitem
  // explicitamente (metadata.allow_pickup === true). O vendedor decide isso no anúncio.
  if (deliveryMethod === 'pickup') {
    const blocked = products.find((p) => !(p.metadata && p.metadata.allow_pickup === true));
    if (blocked) {
      throw AppError.unprocessable(
        `O produto "${blocked.title}" não aceita retirada presencial.`,
        'PICKUP_NOT_AVAILABLE'
      );
    }
  }

  const buyer = await db.User.findByPk(buyerId);

  // Verificação de e-mail no checkout (configurável; default OFF até o provedor
  // de e-mail estar configurado). A facial foi movida para o aplicativo.
  const requireEmail = await settings.getBool('verification.require_email_for_checkout', false);
  if (requireEmail && buyer && !buyer.email_verified_at) {
    throw AppError.unprocessable('Confirme seu e-mail para finalizar a compra.', 'EMAIL_NOT_VERIFIED');
  }

  // Facial desativada por padrão (vai para o app). Mantém a retenção só se o admin
  // explicitamente reativar a facial.
  const buyerVerifRequired = await settings.getBool('facial.buyer_required_after_first_purchase', false);
  const holdForBuyer = !!(
    buyerVerifRequired && buyer && !buyer.has_first_purchase && buyer.buyer_verification_status !== 'verified'
  );

  const created = await db.sequelize.transaction(async (tx) => {
    const orders = [];

    for (const [sellerId, sellerItems] of groups.entries()) {
      const sellerUser = await db.User.findByPk(sellerId, { transaction: tx });
      if (!sellerUser) throw AppError.notFound('Vendedor não encontrado.', 'SELLER_NOT_FOUND');

      let subtotal = 0;
      const itemRows = sellerItems.map(({ product, quantity, variation }) => {
        const unitPrice = Number(
          product.promotional_price != null ? product.promotional_price : product.price
        );
        const lineSubtotal = round2(unitPrice * quantity);
        subtotal = round2(subtotal + lineSubtotal);
        return {
          product_id: product.id,
          title_snapshot: product.title,
          unit_price: unitPrice,
          quantity,
          variation,
          subtotal: lineSubtotal,
        };
      });

      const firstProduct = sellerItems[0].product;
      const resolved = await settings.resolveCommission({
        categoryId: firstProduct.category_id,
        sellerTier: sellerUser.seller_tier,
      });

      const shippingCost =
        shippingOption && shippingOption.cost != null ? round2(shippingOption.cost) : 0;
      const commissionRate = Number(resolved.commissionPercent);
      const commissionAmount = round2((subtotal * commissionRate) / 100);
      const sellerAmount = round2(subtotal - commissionAmount);
      const total = round2(subtotal + shippingCost);

      const order = await db.Order.create(
        {
          order_number: generateOrderNumber(),
          buyer_id: buyerId,
          seller_id: sellerId,
          status: 'awaiting_payment',
          subtotal,
          shipping_cost: shippingCost,
          discount: 0,
          total,
          currency: firstProduct.currency || 'BRL',
          commission_rate: commissionRate,
          commission_amount: commissionAmount,
          seller_amount: sellerAmount,
          payment_status: 'pending',
          shipping_status: shippingOption ? 'pending' : 'not_required',
          delivery_method: deliveryMethod,
          held_for_buyer_verification: holdForBuyer,
          placed_at: new Date(),
          metadata: {
            shipping_address: shippingAddress,
            shipping_option: shippingOption,
            escrow_hold_days: resolved.escrowHoldDays,
          },
        },
        { transaction: tx }
      );

      for (const row of itemRows) {
        await db.OrderItem.create({ order_id: order.id, ...row }, { transaction: tx });
      }

      const full = await db.Order.findByPk(order.id, {
        include: [{ model: db.OrderItem, as: 'items' }],
        transaction: tx,
      });
      orders.push(full);
    }

    return orders;
  });

  for (const order of created) {
    emitToUser(order.seller_id, 'order:created', { order_id: order.id, order_number: order.order_number });
  }

  return created;
}

/** Lista pedidos do usuário como comprador ou vendedor. */
async function listForUser(userId, { role = 'buyer', page = 1, limit = 20, status } = {}) {
  const where = role === 'seller' ? { seller_id: userId } : { buyer_id: userId };
  if (status) where.status = status;

  const offset = (Number(page) - 1) * Number(limit);
  const { rows, count } = await db.Order.findAndCountAll({
    where,
    include: [
      {
        model: db.OrderItem,
        as: 'items',
        // Inclui a imagem do produto para o front exibir na lista de pedidos.
        include: [{ model: db.Product, as: 'product', attributes: ['id', 'cover_image_url', 'images'], required: false }],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true,
  });
  return { rows, total: count };
}

/** Lista todos os pedidos (admin). */
async function listAll({ page = 1, limit = 20, status } = {}) {
  const where = {};
  if (status) where.status = status;
  const offset = (Number(page) - 1) * Number(limit);
  const { rows, count } = await db.Order.findAndCountAll({
    where,
    include: [
      {
        model: db.OrderItem,
        as: 'items',
        // Inclui a imagem do produto para o front exibir na lista de pedidos.
        include: [{ model: db.Product, as: 'product', attributes: ['id', 'cover_image_url', 'images'], required: false }],
      },
    ],
    order: [['created_at', 'DESC']],
    limit: Number(limit),
    offset,
    distinct: true,
  });
  return { rows, total: count };
}

function assertCanView(order, user) {
  const isParticipant = order.buyer_id === user.id || order.seller_id === user.id;
  const isAdmin = user.is_admin === true;
  if (!isParticipant && !isAdmin) {
    throw AppError.forbidden('Você não tem acesso a este pedido.', 'ORDER_FORBIDDEN');
  }
}

async function getById(id, user) {
  const order = await db.Order.findByPk(id, {
    include: [
      {
        model: db.OrderItem,
        as: 'items',
        include: [{ model: db.Product, as: 'product', attributes: ['id', 'cover_image_url', 'images'], required: false }],
      },
      { model: db.User, as: 'buyer', attributes: ['id', 'name', 'email', 'phone', 'avatar_url', 'created_at'] },
      { model: db.User, as: 'seller', attributes: ['id', 'name', 'email', 'avatar_url', 'created_at'] },
      { model: db.Payment, as: 'payments' },
      { model: db.Escrow, as: 'escrow' },
      { model: db.Shipment, as: 'shipments' },
      { model: db.Dispute, as: 'disputes' },
    ],
  });
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
  assertCanView(order, user);
  return order;
}

/** Cancela um pedido ainda não pago. */
async function cancel(id, user) {
  const order = await db.Order.findByPk(id);
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
  assertCanView(order, user);

  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    throw AppError.conflict('Este pedido não pode mais ser cancelado.', 'ORDER_NOT_CANCELLABLE');
  }

  await order.update({ status: 'cancelled', cancelled_at: new Date() });

  const counterparty = user.id === order.buyer_id ? order.seller_id : order.buyer_id;
  emitToUser(counterparty, 'order:cancelled', { order_id: order.id });

  return order;
}

/* --------------------------------- disputes ------------------------------- */

/** Abre uma disputa (comprador contra o vendedor). */
async function openDispute(orderId, buyerId, { reason, description, evidence } = {}) {
  if (!reason || !DISPUTE_REASONS.includes(reason)) {
    throw AppError.unprocessable(
      `reason inválido. Valores: ${DISPUTE_REASONS.join(', ')}.`,
      'INVALID_DISPUTE_REASON'
    );
  }

  return db.sequelize.transaction(async (tx) => {
    const order = await db.Order.findByPk(orderId, { transaction: tx });
    if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
    if (order.buyer_id !== buyerId) {
      throw AppError.forbidden('Apenas o comprador pode abrir uma disputa.', 'NOT_ORDER_BUYER');
    }
    if (['cancelled', 'refunded'].includes(order.status)) {
      throw AppError.conflict('Não é possível abrir disputa para este pedido.', 'ORDER_NOT_DISPUTABLE');
    }

    const existing = await db.Dispute.findOne({
      where: {
        order_id: orderId,
        status: { [Op.in]: ['open', 'under_review', 'awaiting_response'] },
      },
      transaction: tx,
    });
    if (existing) throw AppError.conflict('Já existe uma disputa aberta para este pedido.', 'DISPUTE_ALREADY_OPEN');

    const dispute = await db.Dispute.create(
      {
        order_id: orderId,
        opened_by: buyerId,
        against_id: order.seller_id,
        reason,
        description: description || null,
        status: 'open',
        amount_disputed: order.total,
        evidence: evidence || null,
      },
      { transaction: tx }
    );

    await order.update({ status: 'disputed' }, { transaction: tx });

    const escrow = await db.Escrow.findOne({ where: { order_id: orderId }, transaction: tx });
    if (escrow && escrow.status === 'held') {
      await escrow.update({ status: 'disputed' }, { transaction: tx });
    }

    emitToUser(order.seller_id, 'dispute:opened', { order_id: order.id, dispute_id: dispute.id });

    return dispute;
  });
}

/** Resolve uma disputa (admin). Aplica reembolso ou liberação do escrow. */
async function resolveDispute(disputeId, adminId, { resolution, resolution_notes } = {}) {
  const validResolutions = ['refund_buyer', 'release_seller', 'partial_refund', 'none'];
  if (!resolution || !validResolutions.includes(resolution)) {
    throw AppError.unprocessable(
      `resolution inválido. Valores: ${validResolutions.join(', ')}.`,
      'INVALID_RESOLUTION'
    );
  }

  return db.sequelize.transaction(async (tx) => {
    const dispute = await db.Dispute.findByPk(disputeId, { transaction: tx });
    if (!dispute) throw AppError.notFound('Disputa não encontrada.', 'DISPUTE_NOT_FOUND');
    if (dispute.status === 'resolved') {
      throw AppError.conflict('Disputa já resolvida.', 'DISPUTE_ALREADY_RESOLVED');
    }

    const order = await db.Order.findByPk(dispute.order_id, { transaction: tx });
    if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');

    const escrow = await db.Escrow.findOne({ where: { order_id: order.id }, transaction: tx });

    await dispute.update(
      {
        status: 'resolved',
        resolution,
        resolution_notes: resolution_notes || null,
        resolved_by: adminId,
        assigned_admin_id: dispute.assigned_admin_id || adminId,
        resolved_at: new Date(),
      },
      { transaction: tx }
    );

    if (resolution === 'refund_buyer' || resolution === 'partial_refund') {
      // Estorno via gateway (best-effort) + marca escrow como reembolsado.
      const payment = await db.Payment.findOne({
        where: { order_id: order.id, status: 'approved' },
        order: [['created_at', 'DESC']],
        transaction: tx,
      });
      if (payment) {
        const paymentService = require('../payment/payment.service');
        await paymentService.refund(payment, { transaction: tx });
      }
      if (escrow) await escrow.update({ status: 'refunded' }, { transaction: tx });
      await order.update({ status: 'refunded', payment_status: 'refunded' }, { transaction: tx });

      emitToUser(order.buyer_id, 'dispute:resolved', { order_id: order.id, resolution });
    } else if (resolution === 'release_seller') {
      if (escrow && ['held', 'disputed'].includes(escrow.status)) {
        await escrow.update(
          {
            status: 'released',
            released_at: new Date(),
            released_by: adminId,
            release_reason: 'dispute_resolved_seller',
          },
          { transaction: tx }
        );
      }
      await order.update({ status: 'completed', completed_at: new Date() }, { transaction: tx });
      emitToUser(order.seller_id, 'dispute:resolved', { order_id: order.id, resolution });
    } else {
      // 'none' — apenas registra; volta o pedido para 'paid' se havia pagamento.
      await order.update({ status: 'paid' }, { transaction: tx });
    }

    return dispute;
  });
}

module.exports = {
  checkout,
  listForUser,
  listAll,
  getById,
  cancel,
  openDispute,
  resolveDispute,
};
