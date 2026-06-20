'use strict';

/**
 * Serviço de Pagamentos (Mercado Pago) com SPLIT/repasse nativo.
 *
 * Quando o split está habilitado (admin) e o vendedor vinculou a conta (OAuth),
 * o pagamento é criado com o token DO VENDEDOR + marketplace_fee/application_fee
 * (comissão dinâmica de commission_rules). O Mercado Pago repassa o líquido
 * direto ao vendedor. A retenção do dinheiro ("segurar pro repasse") é
 * configurável: custódia da plataforma, captura tardia (auth→capture) ou dias
 * de liberação do MP. NADA é hardcoded — tudo vem de platform_settings.
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const settings = require('../../services/settings.cache');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');
const accountService = require('./payment-account.service');
const { emitToUser } = require('../../realtime/io');

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;

const STATUS_MAP = {
  pending: 'pending',
  in_process: 'in_process',
  in_mediation: 'in_process',
  authorized: 'authorized',
  approved: 'approved',
  rejected: 'rejected',
  refunded: 'refunded',
  cancelled: 'cancelled',
  charged_back: 'charged_back',
};

/** Configuração dinâmica do split/repasse (admin). */
async function splitConfig() {
  return {
    splitEnabled: await settings.getBool('payment.split_enabled', false),
    requireSellerLink: await settings.getBool('payment.require_seller_link', false),
    holdStrategy: (await settings.get('payment.hold_strategy', 'platform_escrow')) || 'platform_escrow',
    moneyReleaseDays: await settings.getNumber('payment.money_release_days', 0),
    binaryMode: await settings.getBool('payment.binary_mode', false),
    statementDescriptor: (await settings.get('payment.statement_descriptor', 'FEIRADOROLO')) || undefined,
    advancedOptions: (await settings.get('payment.advanced_options', {})) || {},
  };
}

async function notificationUrl(paymentId) {
  const base = (await settings.get('app.public_url', '')) || 'http://localhost:3333';
  return `${base}/api/v1/payments/webhook?pid=${paymentId}`;
}

/** Resolve o token do vendedor para o split (ou null se não vinculado). */
async function resolveSellerToken(order, cfg) {
  if (!cfg.splitEnabled) return null;
  const token = await accountService.getActiveAccessToken(order.seller_id);
  if (!token && cfg.requireSellerLink) {
    throw AppError.conflict(
      'O vendedor ainda não conectou a conta de recebimento (Mercado Pago).',
      'SELLER_NOT_LINKED'
    );
  }
  return token;
}

/**
 * Cria a preferência de checkout (Checkout Pro). Com split habilitado e vendedor
 * vinculado, usa o token do vendedor + marketplace_fee = comissão.
 */
async function createCheckoutPreference(orderId, buyer) {
  const order = await db.Order.findByPk(orderId, { include: [{ model: db.OrderItem, as: 'items' }] });
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
  if (order.buyer_id !== buyer.id) throw AppError.forbidden('Você não é o comprador deste pedido.', 'NOT_ORDER_BUYER');
  if (order.payment_status === 'paid') throw AppError.conflict('Este pedido já foi pago.', 'ORDER_ALREADY_PAID');
  if (!['pending', 'awaiting_payment'].includes(order.status)) {
    throw AppError.conflict('Este pedido não está aguardando pagamento.', 'ORDER_NOT_PAYABLE');
  }

  const cfg = await splitConfig();
  const sellerToken = await resolveSellerToken(order, cfg);

  const amount = round2(order.total != null ? order.total : order.subtotal);
  const marketplaceFee = order.commission_amount != null ? round2(order.commission_amount) : null;
  const webUrl = (await settings.get('app.web_url', '')) || '';

  const payment = await db.Payment.create({
    order_id: order.id,
    user_id: buyer.id,
    provider: 'mercado_pago',
    purpose: 'order',
    amount,
    currency: order.currency || 'BRL',
    status: 'pending',
    platform_fee: marketplaceFee,
    split: { mode: cfg.splitEnabled ? 'mp_native' : 'platform', seller_linked: !!sellerToken, hold_strategy: cfg.holdStrategy },
  });

  const mpItems = (order.items || []).map((it) => ({
    title: it.title_snapshot,
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price),
    currency_id: order.currency || 'BRL',
  }));
  if (Number(order.shipping_cost) > 0) {
    mpItems.push({ title: 'Frete', quantity: 1, unit_price: Number(order.shipping_cost), currency_id: order.currency || 'BRL' });
  }

  try {
    const pref = await mercadopago.createPreference({
      items: mpItems,
      payer: { email: buyer.email },
      externalReference: payment.id,
      // marketplace_fee só faz sentido com o token do vendedor (split nativo).
      marketplaceFee: sellerToken ? marketplaceFee : null,
      sellerAccessToken: sellerToken,
      binaryMode: cfg.binaryMode,
      statementDescriptor: cfg.statementDescriptor,
      advancedOptions: cfg.advancedOptions,
      notificationUrl: await notificationUrl(payment.id),
      backUrls: {
        success: `${webUrl}/orders/${order.id}`,
        failure: `${webUrl}/orders/${order.id}`,
        pending: `${webUrl}/orders/${order.id}`,
      },
      metadata: { order_id: order.id, payment_id: payment.id },
    });
    await payment.update({ preference_id: pref.id });
    return { payment, checkout: pref, split: payment.split };
  } catch (err) {
    if (err instanceof AppError && err.statusCode === 503) {
      logger.warn('createCheckoutPreference: gateway não configurado, retornando aviso.');
      return { payment, checkout: null, warning: 'Gateway de pagamento não configurado. Configure no painel admin.' };
    }
    throw err;
  }
}

/**
 * Pagamento direto via Checkout API (cartão tokenizado) com captura configurável.
 * Estratégia 'mp_capture' autoriza sem capturar (segura o dinheiro) e a captura
 * ocorre na liberação do escrow. 'mp_release_days' usa o prazo de liberação do MP.
 */
async function createOrderPayment(orderId, buyer, { token, payment_method_id, installments = 1 }) {
  const order = await db.Order.findByPk(orderId, { include: [{ model: db.OrderItem, as: 'items' }] });
  if (!order) throw AppError.notFound('Pedido não encontrado.', 'ORDER_NOT_FOUND');
  if (order.buyer_id !== buyer.id) throw AppError.forbidden('Você não é o comprador deste pedido.', 'NOT_ORDER_BUYER');
  if (order.payment_status === 'paid') throw AppError.conflict('Este pedido já foi pago.', 'ORDER_ALREADY_PAID');

  const cfg = await splitConfig();
  const sellerToken = await resolveSellerToken(order, cfg);
  const amount = round2(order.total != null ? order.total : order.subtotal);
  const marketplaceFee = order.commission_amount != null ? round2(order.commission_amount) : null;
  const capture = cfg.holdStrategy === 'mp_capture' ? false : true;
  const moneyReleaseDays = cfg.holdStrategy === 'mp_release_days' && cfg.moneyReleaseDays > 0 ? cfg.moneyReleaseDays : null;

  const payment = await db.Payment.create({
    order_id: order.id,
    user_id: buyer.id,
    provider: 'mercado_pago',
    purpose: 'order',
    amount,
    method: payment_method_id,
    installments,
    currency: order.currency || 'BRL',
    status: 'pending',
    platform_fee: marketplaceFee,
    split: { mode: cfg.splitEnabled ? 'mp_native' : 'platform', seller_linked: !!sellerToken, hold_strategy: cfg.holdStrategy, capture },
  });

  const mp = await mercadopago.createPayment({
    amount,
    description: `Pedido ${order.order_number}`,
    payerEmail: buyer.email,
    token,
    paymentMethodId: payment_method_id,
    installments,
    applicationFee: sellerToken ? marketplaceFee : null,
    capture,
    moneyReleaseDays,
    sellerAccessToken: sellerToken,
    binaryMode: cfg.binaryMode,
    statementDescriptor: cfg.statementDescriptor,
    advancedOptions: cfg.advancedOptions,
    externalReference: payment.id,
    notificationUrl: await notificationUrl(payment.id),
  });

  await _applyMpPayment(payment, mp);
  return { payment: await payment.reload(), gateway: { id: mp.id, status: mp.status, status_detail: mp.status_detail } };
}

/** Webhook do Mercado Pago. SEMPRE retorna objeto; controller responde 200. */
async function handleWebhook(body = {}, query = {}) {
  const type = body.type || body.topic || query.type || query.topic;
  if (type && type !== 'payment') return { ignored: true, reason: `topic ${type}` };

  const mpPaymentId = (body.data && body.data.id) || body.id || query.id || query['data.id'] || null;
  if (!mpPaymentId) return { ignored: true, reason: 'no payment id' };

  // Resolve o Payment local pelo pid embutido na notification_url (split-friendly).
  let payment = null;
  if (query.pid) payment = await db.Payment.findByPk(query.pid);

  // Descobre o token correto (vendedor) para consultar o pagamento no MP.
  let sellerToken = null;
  if (payment && payment.order_id) {
    const ord = await db.Order.findByPk(payment.order_id);
    if (ord) sellerToken = await accountService.getActiveAccessToken(ord.seller_id);
  }

  let mpPayment;
  try {
    mpPayment = await mercadopago.getPayment(mpPaymentId, sellerToken);
  } catch (err) {
    logger.error('handleWebhook: falha ao consultar pagamento no MP:', err.message);
    return { ignored: true, reason: 'mp fetch failed' };
  }

  if (!payment) {
    const ext = mpPayment.external_reference;
    if (ext) payment = await db.Payment.findByPk(ext);
    if (!payment) payment = await db.Payment.findOne({ where: { external_id: String(mpPaymentId) } });
  }
  if (!payment) {
    logger.warn(`handleWebhook: Payment local não encontrado (mp=${mpPaymentId}).`);
    return { ignored: true, reason: 'local payment not found' };
  }

  if (payment.status === 'approved') return { ok: true, idempotent: true };

  await _applyMpPayment(payment, mpPayment);
  return { ok: true };
}

/** Aplica o estado de um pagamento do MP ao Payment local + efeitos colaterais. */
async function _applyMpPayment(payment, mpPayment) {
  const newStatus = STATUS_MAP[mpPayment.status] || 'pending';
  const platformFee = payment.platform_fee != null ? Number(payment.platform_fee) : 0;
  const grossAmount = Number(mpPayment.transaction_amount || payment.amount || 0);
  const gatewayFee = Array.isArray(mpPayment.fee_details)
    ? round2(mpPayment.fee_details.reduce((s, f) => s + Number(f.amount || 0), 0))
    : null;
  const netAmount = round2(grossAmount - platformFee - (gatewayFee || 0));

  await payment.update({
    status: newStatus,
    external_id: String(mpPayment.id || payment.external_id || ''),
    method: mpPayment.payment_method_id || mpPayment.payment_type_id || payment.method,
    installments: mpPayment.installments != null ? Number(mpPayment.installments) : payment.installments,
    gateway_fee: gatewayFee,
    net_amount: netAmount,
    paid_at: newStatus === 'approved' ? new Date(mpPayment.date_approved || Date.now()) : payment.paid_at,
    payload: mpPayment,
  });

  if (newStatus === 'approved') await _onApproved(payment);
  else if (newStatus === 'authorized') await _onAuthorized(payment);
  else if (['rejected', 'cancelled'].includes(newStatus) && payment.order_id) {
    const order = await db.Order.findByPk(payment.order_id);
    if (order && order.payment_status === 'pending') await order.update({ payment_status: 'failed' });
  }
}

/** Pagamento autorizado mas não capturado (dinheiro retido para repasse). */
async function _onAuthorized(payment) {
  if (payment.purpose !== 'order' || !payment.order_id) return;
  const order = await db.Order.findByPk(payment.order_id);
  if (!order) return;
  const escrowService = require('../escrow/escrow.service');
  await escrowService.createForOrder(order, payment, {});
  if (order.status === 'pending' || order.status === 'awaiting_payment') {
    await order.update({ status: 'processing' });
  }
  await _triggerVerification(order);
  emitToUser(order.seller_id, 'order:authorized', { order_id: order.id });
}

/** Efeitos de um pagamento aprovado (escrow, verificações, destaque). */
async function _onApproved(payment) {
  if (payment.purpose === 'order' && payment.order_id) {
    await db.sequelize.transaction(async (tx) => {
      const order = await db.Order.findByPk(payment.order_id, { transaction: tx });
      if (!order) return;
      if (order.payment_status !== 'paid') {
        await order.update({ status: 'paid', payment_status: 'paid', paid_at: new Date() }, { transaction: tx });
      }
      const escrowService = require('../escrow/escrow.service');
      await escrowService.createForOrder(order, payment, { transaction: tx });
      await _triggerVerification(order, tx);
      emitToUser(order.buyer_id, 'payment:approved', { order_id: order.id, payment_id: payment.id });
      emitToUser(order.seller_id, 'order:paid', { order_id: order.id });
    });
  } else if (payment.purpose === 'highlight') {
    try {
      const productService = require('../product/product.service');
      if (productService && typeof productService.activateHighlight === 'function') {
        await productService.activateHighlight(payment);
      }
    } catch (err) {
      logger.error('handleWebhook: falha ao ativar destaque:', err.message);
    }
  }
}

/** Gatilhos de verificação facial (1ª compra / 1ª venda). */
async function _triggerVerification(order, tx = null) {
  const opts = tx ? { transaction: tx } : {};
  const buyer = await db.User.findByPk(order.buyer_id, opts);
  if (buyer) {
    const patch = {};
    if (!buyer.has_first_purchase) patch.has_first_purchase = true;
    if (buyer.buyer_verification_status === 'not_required') patch.buyer_verification_status = 'pending';
    if (Object.keys(patch).length) await buyer.update(patch, opts);
  }
  const seller = await db.User.findByPk(order.seller_id, opts);
  if (seller) {
    const patch = {};
    if (!seller.has_first_sale) patch.has_first_sale = true;
    if (seller.seller_verification_status === 'not_required') patch.seller_verification_status = 'pending';
    if (Object.keys(patch).length) await seller.update(patch, opts);
  }
}

/**
 * Captura (libera) o pagamento autorizado de um pedido — usado pela liberação
 * do escrow para efetivar o repasse ao vendedor. Best-effort: retorna boolean.
 */
async function captureForOrder(orderId) {
  const payment = await db.Payment.findOne({
    where: { order_id: orderId, purpose: 'order', status: 'authorized' },
    order: [['created_at', 'DESC']],
  });
  if (!payment || !payment.external_id) return false;
  const order = await db.Order.findByPk(orderId);
  const sellerToken = order ? await accountService.getActiveAccessToken(order.seller_id) : null;
  try {
    const mp = await mercadopago.capturePayment(payment.external_id, { sellerAccessToken: sellerToken });
    await payment.update({ status: STATUS_MAP[mp.status] || 'approved', paid_at: new Date(mp.date_approved || Date.now()), payload: mp });
    return true;
  } catch (err) {
    logger.error(`captureForOrder: falha ao capturar pagamento do pedido ${orderId}:`, err.message);
    return false;
  }
}

async function refund(payment, options = {}) {
  const tx = options.transaction || null;
  if (payment.status !== 'approved' && payment.status !== 'authorized') {
    await payment.update({ status: 'refunded' }, { transaction: tx });
    return payment;
  }
  try {
    if (payment.external_id) {
      const order = payment.order_id ? await db.Order.findByPk(payment.order_id) : null;
      const sellerToken = order ? await accountService.getActiveAccessToken(order.seller_id) : null;
      await mercadopago.refundPayment(payment.external_id, options.amount || null, sellerToken);
    }
  } catch (err) {
    logger.error('refund: falha ao estornar no gateway:', err.message);
  }
  await payment.update({ status: 'refunded' }, { transaction: tx });
  return payment;
}

async function getById(id, user) {
  const payment = await db.Payment.findByPk(id, { include: [{ model: db.Order, as: 'order' }] });
  if (!payment) throw AppError.notFound('Pagamento não encontrado.', 'PAYMENT_NOT_FOUND');
  const isOwner = payment.user_id === user.id;
  const isSeller = payment.order && payment.order.seller_id === user.id;
  if (!isOwner && !isSeller && user.is_admin !== true) {
    throw AppError.forbidden('Você não tem acesso a este pagamento.', 'PAYMENT_FORBIDDEN');
  }
  return payment;
}

async function listForOrder(orderId) {
  return db.Payment.findAll({ where: { order_id: orderId }, order: [['created_at', 'DESC']] });
}

module.exports = {
  splitConfig,
  createCheckoutPreference,
  createOrderPayment,
  handleWebhook,
  captureForOrder,
  refund,
  getById,
  listForOrder,
};
