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
const crypto = require('crypto');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const settings = require('../../services/settings.cache');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');
const zapi = require('../../providers/zapi/zapi.provider');
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
  const base = (await settings.get('app.public_url', '')) || '';
  // O MP exige URL pública https válida. Sem isso, retorna null e o pagamento
  // é criado sem webhook (o status atualiza via polling no front).
  if (!/^https:\/\/[^/]+/i.test(base)) return null;
  return `${base.replace(/\/$/, '')}/api/v1/payments/webhook?pid=${paymentId}`;
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

  // Verificação por WhatsApp ao pagar. Só bloqueia se a Z-API estiver configurada
  // (senão não há como entregar o código — não trava o pagamento à toa).
  const requirePhone = await settings.getBool('verification.require_phone_for_payment', false);
  if (requirePhone && (await zapi.isConfigured())) {
    const u = await db.User.findByPk(buyer.id, { attributes: ['phone_verified_at'] });
    if (!u || !u.phone_verified_at) {
      throw AppError.unprocessable('Confirme seu WhatsApp para concluir o pagamento.', 'PHONE_NOT_VERIFIED');
    }
  }

  // Dados do pagador (MP exige nome + documento no Checkout Transparente — PIX/cartão/boleto).
  const buyerRow = await db.User.findByPk(buyer.id, { attributes: ['name', 'email', 'cpf', 'cnpj'] }).catch(() => null);
  const buyerName = (buyerRow && buyerRow.name) || buyer.name || '';
  const [firstName, ...rest] = String(buyerName).trim().split(/\s+/).filter(Boolean);
  const buyerDoc = buyerRow && (buyerRow.cpf || buyerRow.cnpj);
  const payerIdentification = buyerDoc
    ? { type: buyerRow && buyerRow.cnpj ? 'CNPJ' : 'CPF', number: String(buyerDoc).replace(/\D/g, '') }
    : null;

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
    payerFirstName: firstName || undefined,
    payerLastName: rest.length ? rest.join(' ') : undefined,
    payerIdentification: payerIdentification || undefined,
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

  // Dados para o Checkout Transparente exibir no próprio site (sem redirecionar).
  const txd = mp.point_of_interaction && mp.point_of_interaction.transaction_data;
  const pix = txd
    ? { qr_code: txd.qr_code || null, qr_code_base64: txd.qr_code_base64 || null, ticket_url: txd.ticket_url || null }
    : null;
  const td = mp.transaction_details || {};
  const boleto = td.external_resource_url
    ? { url: td.external_resource_url, barcode: (mp.barcode && mp.barcode.content) || null }
    : null;

  return {
    payment: await payment.reload(),
    gateway: { id: mp.id, status: mp.status, status_detail: mp.status_detail },
    pix,
    boleto,
  };
}

/**
 * Valida a assinatura do webhook do Mercado Pago (HMAC-SHA256).
 *
 * O MP envia o header `x-signature` no formato `ts=<ts>,v1=<hash>` e um
 * `x-request-id`. O manifesto assinado é:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * e o hash é HMAC-SHA256(manifest, webhook_secret).
 *
 * Retorna true quando válido OU quando não há segredo configurado (mantém o
 * comportamento atual — processa). Retorna false apenas quando há segredo e a
 * assinatura é inválida/ausente.
 */
async function verifyWebhookSignature(headers = {}, query = {}, dataId) {
  let secret = null;
  try {
    const gateway = await settings.activeGateway('mercado_pago');
    secret = gateway && gateway.webhookSecret ? gateway.webhookSecret : null;
  } catch (err) {
    logger.warn('verifyWebhookSignature: falha ao obter o gateway ativo:', err.message);
    return true; // sem como validar → não bloqueia (comportamento atual).
  }
  if (!secret) return true; // sem segredo configurado → processa normalmente.

  const signature = headers['x-signature'] || headers['X-Signature'];
  const requestId = headers['x-request-id'] || headers['X-Request-Id'];
  if (!signature) {
    logger.warn('verifyWebhookSignature: header x-signature ausente; ignorando webhook.');
    return false;
  }

  // x-signature: "ts=1700000000,v1=abc123..."
  let ts = null;
  let v1 = null;
  for (const part of String(signature).split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key === 'ts') ts = value;
    else if (key === 'v1') v1 = value;
  }
  if (!ts || !v1) {
    logger.warn('verifyWebhookSignature: x-signature malformado; ignorando webhook.');
    return false;
  }

  // O id do manifesto é o data.id (preferencialmente da query, conforme docs do MP).
  const id = query['data.id'] || (query.data && query.data.id) || dataId || '';
  const manifest = `id:${id};request-id:${requestId || ''};ts:${ts};`;
  const expected = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

  let ok = false;
  try {
    ok =
      expected.length === String(v1).length &&
      crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(String(v1)));
  } catch (err) {
    ok = false;
  }
  if (!ok) {
    logger.warn('verifyWebhookSignature: assinatura HMAC inválida; ignorando webhook.');
  }
  return ok;
}

/** Webhook do Mercado Pago. SEMPRE retorna objeto; controller responde 200. */
async function handleWebhook(body = {}, query = {}, headers = {}) {
  const type = body.type || body.topic || query.type || query.topic;
  if (type && type !== 'payment') return { ignored: true, reason: `topic ${type}` };

  const mpPaymentId = (body.data && body.data.id) || body.id || query.id || query['data.id'] || null;
  if (!mpPaymentId) return { ignored: true, reason: 'no payment id' };

  // Valida a assinatura HMAC quando o gateway tem webhook_secret configurado.
  const signatureValid = await verifyWebhookSignature(headers, query, mpPaymentId);
  if (!signatureValid) return { ignored: true, reason: 'invalid signature' };

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
    // Cria o envio (pending) automaticamente para pedidos com frete. Best-effort:
    // a etiqueta continua manual (trava KYC do vendedor em shipment.generateLabel).
    await _ensureShipmentForOrder(payment.order_id);
  } else if (payment.purpose === 'highlight') {
    try {
      const productService = require('../product/product.service');
      if (productService && typeof productService.activateHighlight === 'function') {
        await productService.activateHighlight(payment);
      }
    } catch (err) {
      logger.error('handleWebhook: falha ao ativar destaque:', err.message);
    }
  } else if (payment.purpose === 'plan') {
    await _activatePlanSubscription(payment);
  }
}

/**
 * Garante um Shipment (pending) para o pedido quando aplicável. Best-effort: não
 * falha o webhook. Não gera etiqueta (isso continua manual, com a trava KYC).
 */
async function _ensureShipmentForOrder(orderId) {
  try {
    const order = await db.Order.findByPk(orderId);
    if (!order) return;
    // pickup não tem envio; requires_shipping === false desativa explicitamente.
    if (order.delivery_method === 'pickup') return;
    if (order.requires_shipping === false) return;

    const existing = await db.Shipment.findOne({ where: { order_id: order.id } });
    if (existing) return;

    const meta = order.metadata || {};
    const opt = meta.shipping_option || {};

    // Origem = endereço do vendedor.
    const seller = await db.User.findByPk(order.seller_id);
    const fromAddress = seller
      ? {
          name: seller.name,
          zip_code: seller.zip_code,
          street: seller.street,
          number: seller.number,
          complement: seller.complement,
          neighborhood: seller.neighborhood,
          city: seller.city,
          state: seller.state,
        }
      : null;

    // Dimensões/peso do produto (primeiro item).
    const item = await db.OrderItem.findOne({
      where: { order_id: order.id },
      include: [{ model: db.Product, as: 'product', attributes: ['weight_grams', 'dimensions'] }],
    });
    const product = item && item.product;
    const dimensions = product
      ? { weight: (Number(product.weight_grams) || 0) / 1000, ...(product.dimensions || {}) }
      : opt.dimensions || null;

    const shipmentService = require('../shipment/shipment.service');
    await shipmentService.createForOrder(
      order.id,
      {
        service_code: opt.service_code || opt.id || null,
        service_name: opt.service_name || opt.name || null,
        cost: opt.cost != null ? opt.cost : opt.price != null ? opt.price : order.shipping_cost,
        from_address: fromAddress,
        to_address: meta.shipping_address || null,
        dimensions,
      },
      null
    );
  } catch (err) {
    logger.error(`_ensureShipmentForOrder: falha ao criar envio do pedido ${orderId}:`, err.message);
  }
}

/**
 * Ativa a assinatura de plano correspondente ao pagamento aprovado. Espelha a
 * ativação de destaque: define active + janela de vigência (duration_days).
 * Best-effort: não falha o webhook.
 */
async function _activatePlanSubscription(payment) {
  try {
    const subscription = await db.PlanSubscription.findOne({
      where: { payment_id: payment.id },
      include: [{ model: db.Plan, as: 'plan' }],
    });
    if (!subscription) {
      logger.warn(`_activatePlanSubscription: assinatura não encontrada para o pagamento ${payment.id}.`);
      return;
    }
    if (subscription.status === 'active') return; // idempotente.

    const durationDays =
      subscription.plan && subscription.plan.duration_days ? Number(subscription.plan.duration_days) : null;
    const startsAt = new Date();
    const endsAt = durationDays
      ? new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;

    await subscription.update({ status: 'active', starts_at: startsAt, ends_at: endsAt });
    emitToUser(subscription.user_id, 'plan:activated', {
      subscription_id: subscription.id,
      plan_id: subscription.plan_id,
    });
  } catch (err) {
    logger.error('_activatePlanSubscription: falha ao ativar assinatura de plano:', err.message);
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

/* ---- Histórico de pagamentos do usuário logado (Minha Conta › Pagamentos) ---- */

const APPROVED_STATUSES = ['approved', 'authorized'];
const PENDING_STATUSES = ['pending', 'in_process'];
const OTHER_STATUSES = ['rejected', 'cancelled', 'refunded', 'charged_back'];

const TIER_LABELS = { silver: 'Prata', gold: 'Ouro', diamond: 'Diamante' };
const METHOD_LABELS = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  boleto: 'Boleto',
  account_money: 'Saldo Mercado Pago',
};

/** Normaliza o método salvo (pode vir como 'visa', 'master', etc. do MP). */
function normalizeMethod(raw) {
  if (!raw) return null;
  const m = String(raw).toLowerCase();
  if (m === 'pix') return 'pix';
  if (m === 'bolbradesco' || m === 'boleto' || m === 'ticket') return 'boleto';
  if (m === 'account_money') return 'account_money';
  if (m.includes('deb')) return 'debit_card';
  return 'credit_card';
}

/** Extrai um link de pagamento (pix/boleto/checkout) do payload, se existir. */
function extractPayUrl(payment) {
  const p = payment.payload || {};
  const txd = (p.point_of_interaction && p.point_of_interaction.transaction_data) || {};
  if (txd.ticket_url) return txd.ticket_url;
  const td = p.transaction_details || {};
  if (td.external_resource_url) return td.external_resource_url;
  if (p.ticket_url) return p.ticket_url;
  return null;
}

/** Extrai o QR Code Pix (copia-e-cola) do payload, se existir. */
function extractPixCode(payment) {
  const p = payment.payload || {};
  const txd = (p.point_of_interaction && p.point_of_interaction.transaction_data) || {};
  return txd.qr_code || null;
}

/**
 * Lista paginada do histórico de pagamentos do usuário logado (todos os
 * propósitos), com descrição legível e resumo (total gasto + contagens).
 *
 * Eficiente: 1 query para os pagamentos da página + lookups em lote por
 * payment_id (highlights/planos) e um include do pedido. Sem N+1.
 */
async function listMine(user, { page = 1, limit = 20, status, group } = {}) {
  const pg = Math.max(1, Number(page) || 1);
  const lim = Math.min(50, Math.max(1, Number(limit) || 20));
  const offset = (pg - 1) * lim;

  const where = { user_id: user.id };
  if (status) {
    where.status = status;
  } else if (group === 'pending') {
    where.status = { [db.Sequelize.Op.in]: PENDING_STATUSES };
  } else if (group === 'done' || group === 'approved') {
    where.status = { [db.Sequelize.Op.in]: APPROVED_STATUSES };
  } else if (group === 'other') {
    where.status = { [db.Sequelize.Op.in]: OTHER_STATUSES };
  }

  const { rows, count } = await db.Payment.findAndCountAll({
    where,
    include: [{ model: db.Order, as: 'order', attributes: ['id', 'order_number'], required: false }],
    order: [['created_at', 'DESC']],
    limit: lim,
    offset,
  });

  // Lookups em lote para descrições de destaques/planos (sem N+1).
  const ids = rows.map((r) => r.id);
  const highlightPayIds = rows.filter((r) => r.purpose === 'highlight').map((r) => r.id);
  const planPayIds = rows.filter((r) => r.purpose === 'plan').map((r) => r.id);

  const [highlights, subscriptions] = await Promise.all([
    highlightPayIds.length
      ? db.ProductHighlight.findAll({
          where: { payment_id: { [db.Sequelize.Op.in]: highlightPayIds } },
          attributes: ['payment_id', 'tier', 'product_id'],
          include: [{ model: db.Product, as: 'product', attributes: ['id', 'title'], required: false }],
        })
      : Promise.resolve([]),
    planPayIds.length
      ? db.PlanSubscription.findAll({
          where: { payment_id: { [db.Sequelize.Op.in]: planPayIds } },
          attributes: ['payment_id', 'plan_id'],
          include: [{ model: db.Plan, as: 'plan', attributes: ['id', 'name'], required: false }],
        })
      : Promise.resolve([]),
  ]);

  const highlightByPay = new Map(highlights.map((h) => [h.payment_id, h]));
  const subByPay = new Map(subscriptions.map((s) => [s.payment_id, s]));

  const data = rows.map((p) => {
    let description = 'Pagamento';
    if (p.purpose === 'order') {
      description = p.order && p.order.order_number ? `Pedido #${p.order.order_number}` : 'Pedido';
    } else if (p.purpose === 'highlight') {
      const h = highlightByPay.get(p.id);
      const tier = h ? TIER_LABELS[h.tier] || h.tier : '';
      const prod = h && h.product && h.product.title ? ` — ${h.product.title}` : '';
      description = `Destaque ${tier}`.trim() + prod;
    } else if (p.purpose === 'plan') {
      const s = subByPay.get(p.id);
      const planName = s && s.plan && s.plan.name ? s.plan.name : '';
      description = planName ? `Plano ${planName}` : 'Plano';
    }

    const isPayable = PENDING_STATUSES.includes(p.status);
    return {
      id: p.id,
      purpose: p.purpose,
      method: normalizeMethod(p.method),
      method_raw: p.method || null,
      amount: Number(p.amount),
      currency: p.currency || 'BRL',
      status: p.status,
      created_at: p.created_at,
      paid_at: p.paid_at || null,
      description,
      order_id: p.order_id || null,
      pay_url: isPayable ? extractPayUrl(p) : null,
      pix_code: isPayable ? extractPixCode(p) : null,
    };
  });

  const summary = await summaryMine(user);

  return {
    data,
    summary,
    pagination: { page: pg, limit: lim, total: count, pages: Math.ceil(count / lim) || 1 },
  };
}

/**
 * Resumo agregado dos pagamentos do usuário: total gasto (aprovados) e
 * contagens por status. Duas queries agregadas (sem carregar todas as linhas).
 */
async function summaryMine(user) {
  const fn = db.Sequelize.fn;
  const col = db.Sequelize.col;

  const [totalRow, statusRows] = await Promise.all([
    db.Payment.findOne({
      where: { user_id: user.id, status: { [db.Sequelize.Op.in]: APPROVED_STATUSES } },
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
    db.Payment.findAll({
      where: { user_id: user.id },
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
  ]);

  const counts = {};
  let pendingCount = 0;
  let approvedCount = 0;
  let otherCount = 0;
  for (const r of statusRows) {
    const c = Number(r.count) || 0;
    counts[r.status] = c;
    if (PENDING_STATUSES.includes(r.status)) pendingCount += c;
    else if (APPROVED_STATUSES.includes(r.status)) approvedCount += c;
    else otherCount += c;
  }

  return {
    total_spent: Number((totalRow && totalRow.total) || 0),
    currency: 'BRL',
    counts,
    pending: pendingCount,
    approved: approvedCount,
    other: otherCount,
    total: pendingCount + approvedCount + otherCount,
  };
}

module.exports = {
  splitConfig,
  createCheckoutPreference,
  createOrderPayment,
  handleWebhook,
  verifyWebhookSignature,
  captureForOrder,
  refund,
  getById,
  listForOrder,
  listMine,
  summaryMine,
};
