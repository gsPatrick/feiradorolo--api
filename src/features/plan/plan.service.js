'use strict';

/**
 * Serviço de Planos pagos (pacotes de categoria, premium, upgrades de serviço).
 *
 * A compra de um plano segue o MESMO caminho do destaque (highlight): cria uma
 * PlanSubscription pendente + um Payment(purpose='plan') e gera o Pix imediato
 * no Mercado Pago. A ativação ocorre no webhook, quando o pagamento é aprovado
 * (payment.service._activatePlanSubscription), espelhando o destaque.
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');
const logger = require('../../utils/logger');

/** Janela (dias) para considerar uma renovação pendente como "recente" (idempotência). */
const PENDING_RENEWAL_WINDOW_DAYS = 7;

/** Lista os planos ativos (catálogo). */
async function listActive() {
  return db.Plan.findAll({
    where: { is_active: true },
    include: [{ model: db.Category, as: 'category', attributes: ['id', 'name', 'slug'] }],
    order: [['price', 'ASC']],
  });
}

/** Extrai o Pix do retorno bruto do MP (point_of_interaction). */
function pixFromMpPayment(mp) {
  const td =
    mp && mp.point_of_interaction && mp.point_of_interaction.transaction_data
      ? mp.point_of_interaction.transaction_data
      : null;
  if (!td) return null;
  if (!td.qr_code && !td.qr_code_base64) return null;
  return { qr_code: td.qr_code || null, qr_code_base64: td.qr_code_base64 || null };
}

/** Extrai o Pix (qr_code/qr_code_base64) persistido no payload do Payment. */
function pixFromPayment(payment) {
  if (!payment || !payment.payload) return null;
  const p = payment.payload;
  // Formato persistido por nós (payload.pix) ou retorno bruto do MP.
  const qr =
    (p.pix && p.pix.qr_code) ||
    (p.point_of_interaction &&
      p.point_of_interaction.transaction_data &&
      p.point_of_interaction.transaction_data.qr_code) ||
    null;
  const qr64 =
    (p.pix && p.pix.qr_code_base64) ||
    (p.point_of_interaction &&
      p.point_of_interaction.transaction_data &&
      p.point_of_interaction.transaction_data.qr_code_base64) ||
    null;
  if (!qr && !qr64) return null;
  return { qr_code: qr || null, qr_code_base64: qr64 || null };
}

/**
 * Assinaturas do usuário logado (com o plano incluído). Enriquece cada assinatura
 * com payment_id/payment_status e — se pendente e disponível — o `pix` do payload
 * do Payment associado, para o front exibir/checar o QR sem outra chamada.
 */
async function listMine(userId) {
  const subscriptions = await db.PlanSubscription.findAll({
    where: { user_id: userId },
    include: [
      { model: db.Plan, as: 'plan' },
      { model: db.Payment, as: 'payment', attributes: ['id', 'status', 'method', 'payload'] },
    ],
    order: [['created_at', 'DESC']],
  });

  for (const sub of subscriptions) {
    const payment = sub.payment || null;
    sub.setDataValue('payment_id', payment ? payment.id : sub.payment_id || null);
    sub.setDataValue('payment_status', payment ? payment.status : null);
    sub.setDataValue('payment_method', payment ? payment.method : null);
    // Pix só quando a assinatura está pendente e há QR persistido.
    sub.setDataValue('pix', sub.status === 'pending' ? pixFromPayment(payment) : null);
  }
  return subscriptions;
}

/**
 * Cria a assinatura pendente + Payment(purpose='plan') e gera o Pix no MP.
 * Se o gateway não estiver configurado (503), retorna a assinatura/pagamento
 * pendentes com uma nota (espelha purchaseHighlight).
 */
/**
 * Cria a tripla Payment(pending) + PlanSubscription(pending) + Pix dentro de uma
 * transação. Núcleo compartilhado por `subscribe` (compra) e `createRenewalCharge`
 * (renovação). `extraMeta` é mesclado no metadata da assinatura (ex.: renewal=true).
 */
async function _createPlanCharge(plan, user, extraMeta = {}) {
  return db.sequelize.transaction(async (transaction) => {
    const payment = await db.Payment.create(
      {
        user_id: user.id,
        purpose: 'plan',
        provider: 'mercado_pago',
        method: 'pix',
        amount: plan.price,
        status: 'pending',
        currency: plan.currency || 'BRL',
        split: { plan_id: plan.id },
      },
      { transaction }
    );

    const subscription = await db.PlanSubscription.create(
      {
        user_id: user.id,
        plan_id: plan.id,
        payment_id: payment.id,
        status: 'pending',
        starts_at: null,
        ends_at: null,
        metadata: { payment_id: payment.id, ...extraMeta },
      },
      { transaction }
    );

    // Guarda o vínculo da assinatura no split (usado como metadata do Payment).
    await payment.update(
      { split: { plan_id: plan.id, subscription_id: subscription.id } },
      { transaction }
    );

    let pix = null;
    let note = null;
    try {
      pix = await mercadopago.createPixPayment({
        amount: plan.price,
        description: `Plano ${plan.name}`,
        payerEmail: user.email,
        externalReference: payment.id,
        metadata: { payment_id: payment.id, plan_id: plan.id, subscription_id: subscription.id },
      });
    } catch (err) {
      if (err && err.statusCode === 503) {
        note = 'Gateway de pagamento não configurado. Pagamento criado como pendente.';
      } else {
        throw err;
      }
    }

    return { subscription_id: subscription.id, subscription, payment, pix, note };
  });
}

/* ---------------------- Débito automático (cartão) ----------------------- */

const APPROVED_STATUSES = new Set(['approved', 'authorized']);

/** Primeiro nome do usuário (para o Customer do MP). */
function firstName(user) {
  return String(user.name || '').trim().split(/\s+/)[0] || undefined;
}

/**
 * Ativa imediatamente uma assinatura cujo pagamento já voltou aprovado (cartão),
 * espelhando payment.service._activatePlanSubscription (mesmo caminho do webhook).
 * Best-effort: não derruba o fluxo.
 */
async function _activateApprovedSubscription(subscription, plan) {
  try {
    if (subscription.status === 'active') return;
    const durationDays = plan && plan.duration_days ? Number(plan.duration_days) : null;
    const startsAt = new Date();
    const endsAt = durationDays
      ? new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000)
      : null;
    await subscription.update({ status: 'active', starts_at: startsAt, ends_at: endsAt });
  } catch (err) {
    logger.error('plan.service: falha ao ativar assinatura aprovada por cartão:', err.message);
  }
}

/**
 * Garante um SavedCard padrão para o usuário a partir de um token de cartão do
 * checkout transparente: cria/acha o Customer, salva o cartão e grava localmente,
 * desmarcando os demais cartões como não-padrão. Retorna o registro SavedCard.
 */
async function _saveCardForUser(user, card) {
  const customer = await mercadopago.findOrCreateCustomer({
    email: user.email,
    firstName: firstName(user),
  });
  const saved = await mercadopago.saveCardToCustomer({ customerId: customer.id, token: card.token });
  await db.SavedCard.update({ is_default: false }, { where: { user_id: user.id } });
  const record = await db.SavedCard.create({
    user_id: user.id,
    mp_customer_id: customer.id,
    mp_card_id: saved.id,
    last_four: saved.last_four_digits || null,
    brand: (saved.payment_method && (saved.payment_method.name || saved.payment_method.id)) || card.payment_method_id || null,
    is_default: true,
  });
  return record;
}

/**
 * Cobra um plano no cartão (débito automático). Cria Payment + PlanSubscription
 * pendentes, cobra via cartão salvo (chargeSavedCard) ou token direto (createPayment),
 * e — se o MP aprovar — ativa a assinatura na hora pelo mesmo caminho do webhook.
 *
 * @param {object} card { token, payment_method_id, save_card, savedCard }
 *   savedCard (opcional) = registro SavedCard já existente (renovação automática).
 * @returns {Promise<{subscription, payment, approved, mpPayment, note}>}
 */
async function _chargePlanWithCard(plan, user, card, extraMeta = {}) {
  // Se for salvar e ainda não há SavedCard, salva agora (fora da transação — chamadas MP).
  let savedCard = card.savedCard || null;
  if (!savedCard && card.save_card && card.token) {
    savedCard = await _saveCardForUser(user, card);
  }

  // Cria Payment + PlanSubscription pendentes (cartão).
  const { payment, subscription } = await db.sequelize.transaction(async (transaction) => {
    const payment = await db.Payment.create(
      {
        user_id: user.id,
        purpose: 'plan',
        provider: 'mercado_pago',
        method: 'credit_card',
        amount: plan.price,
        status: 'pending',
        currency: plan.currency || 'BRL',
        installments: 1,
        split: { plan_id: plan.id },
      },
      { transaction }
    );
    const subscription = await db.PlanSubscription.create(
      {
        user_id: user.id,
        plan_id: plan.id,
        payment_id: payment.id,
        status: 'pending',
        starts_at: null,
        ends_at: null,
        metadata: { payment_id: payment.id, ...extraMeta },
      },
      { transaction }
    );
    await payment.update(
      { split: { plan_id: plan.id, subscription_id: subscription.id } },
      { transaction }
    );
    return { payment, subscription };
  });

  // Faz a cobrança no MP (token de cartão salvo ou token direto do checkout).
  let mpPayment = null;
  let note = null;
  try {
    if (savedCard) {
      mpPayment = await mercadopago.chargeSavedCard({
        customerId: savedCard.mp_customer_id,
        cardId: savedCard.mp_card_id,
        amount: plan.price,
        description: `Plano ${plan.name}`,
        payerEmail: user.email,
        paymentMethodId: card.payment_method_id || savedCard.brand || undefined,
        externalReference: payment.id,
        idempotencyKey: `plan-card-${payment.id}`,
        metadata: { payment_id: payment.id, plan_id: plan.id, subscription_id: subscription.id },
      });
    } else {
      mpPayment = await mercadopago.createPayment({
        amount: plan.price,
        description: `Plano ${plan.name}`,
        payerEmail: user.email,
        payerFirstName: firstName(user),
        token: card.token,
        paymentMethodId: card.payment_method_id,
        installments: 1,
        externalReference: payment.id,
        idempotencyKey: `plan-card-${payment.id}`,
        metadata: { payment_id: payment.id, plan_id: plan.id, subscription_id: subscription.id },
      });
    }
  } catch (err) {
    logger.error(`plan.service: cobrança no cartão falhou para pagamento ${payment.id}:`, err.message);
    note = 'Falha ao processar o cartão. Tente novamente ou use Pix.';
    return { payment, subscription, approved: false, mpPayment: null, note, error: err };
  }

  // Reflete o resultado no Payment local.
  const mpStatus = mpPayment && mpPayment.status;
  const approved = APPROVED_STATUSES.has(mpStatus);
  try {
    await payment.update({
      external_id: mpPayment && mpPayment.id != null ? String(mpPayment.id) : payment.external_id,
      status: approved ? 'approved' : 'rejected',
      paid_at: approved ? new Date() : null,
      payload: mpPayment || payment.payload,
    });
  } catch (err) {
    logger.error('plan.service: falha ao atualizar Payment após cobrança no cartão:', err.message);
  }

  if (approved) {
    await _activateApprovedSubscription(subscription, plan);
  }

  return { payment, subscription, approved, mpPayment, note };
}

/**
 * Compra/assinatura de um plano.
 * @param {string} planId
 * @param {string} userId
 * @param {object} [opts] { card: { token, payment_method_id, save_card } }
 *   Sem cartão = Pix (comportamento original). Com cartão = débito (e salva, se pedido).
 */
async function subscribe(planId, userId, opts = {}) {
  const plan = await db.Plan.findByPk(planId);
  if (!plan) throw AppError.notFound('Plano não encontrado.', 'PLAN_NOT_FOUND');
  if (!plan.is_active) throw AppError.conflict('Este plano não está disponível.', 'PLAN_INACTIVE');

  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');

  const card = opts && opts.card;
  if (card && card.token) {
    const result = await _chargePlanWithCard(plan, user, card);
    const subscription = result.subscription;
    return {
      subscription_id: subscription.id,
      subscription,
      payment: result.payment,
      approved: result.approved,
      method: 'credit_card',
      note: result.note || null,
    };
  }

  // Sem cartão → Pix (comportamento original).
  return _createPlanCharge(plan, user);
}

/**
 * Gera uma nova cobrança de RENOVAÇÃO a partir de uma assinatura vencida.
 * Cria um novo Payment(pending) + nova PlanSubscription(pending) + Pix para o
 * MESMO user_id/plan_id. A ativação ocorre no webhook do pagamento, como na
 * compra original (payment.service._activatePlanSubscription).
 *
 * Idempotência: se já houver uma assinatura `pending` recente (renovação não
 * paga) para o mesmo user+plan, retorna { skipped: true } SEM criar outra.
 *
 * @param {object} subscription Assinatura vencida (precisa de user_id e plan_id).
 * @returns {Promise<{subscription, payment, pix, note}|{skipped:true}>}
 */
async function createRenewalCharge(subscription) {
  if (!subscription) throw AppError.badRequest('Assinatura é obrigatória.', 'SUBSCRIPTION_REQUIRED');
  const userId = subscription.user_id;
  const planId = subscription.plan_id;

  const plan = await db.Plan.findByPk(planId);
  if (!plan) throw AppError.notFound('Plano não encontrado.', 'PLAN_NOT_FOUND');
  if (!plan.is_active) throw AppError.conflict('Este plano não está disponível.', 'PLAN_INACTIVE');

  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');

  // Idempotência: não cria se já existe renovação pendente recente para user+plan.
  const since = new Date(Date.now() - PENDING_RENEWAL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const existingPending = await db.PlanSubscription.findOne({
    where: {
      user_id: userId,
      plan_id: planId,
      status: 'pending',
      created_at: { [Op.gt]: since },
    },
    order: [['created_at', 'DESC']],
  });
  if (existingPending) {
    return { skipped: true, reason: 'PENDING_RENEWAL_EXISTS', subscription: existingPending };
  }

  const renewalMeta = { renewal: true, renewed_from: subscription.id };

  // Débito automático: se o usuário tem um cartão salvo padrão, cobra direto.
  const defaultCard = await db.SavedCard.findOne({
    where: { user_id: userId, is_default: true },
    order: [['created_at', 'DESC']],
  });

  if (defaultCard) {
    try {
      const result = await _chargePlanWithCard(
        plan,
        user,
        { savedCard: defaultCard, payment_method_id: defaultCard.brand || undefined },
        renewalMeta
      );
      if (result.approved) {
        logger.info(`Renovação automática (cartão) APROVADA para assinatura ${subscription.id} (user ${userId}).`);
        return { ...result, method: 'credit_card', auto: true };
      }
      logger.warn(`Renovação automática (cartão) NÃO aprovada para assinatura ${subscription.id}; caindo no fluxo Pix.`);
      // Falha de cobrança → fallback Pix abaixo.
    } catch (err) {
      logger.error(`Renovação automática (cartão) falhou para assinatura ${subscription.id}:`, err.message);
      // fallback Pix abaixo.
    }
  } else {
    logger.info(`Renovação de assinatura ${subscription.id}: sem cartão salvo, usando fluxo Pix.`);
  }

  // Fallback / sem cartão: gera a cobrança Pix (comportamento original).
  return _createPlanCharge(plan, user, renewalMeta);
}

/**
 * Re-pagar / (re)gerar o Pix de uma assinatura de plano PENDENTE.
 * - Carrega a PlanSubscription do usuário (dona = userId, senão forbidden).
 * - Se já estiver `active` → AppError SUBSCRIPTION_ALREADY_PAID.
 * - Se `pending`: reaproveita o Payment pendente; garante um Pix válido —
 *   reaproveita o do payload, consulta o MP por external_id (se aprovado, ativa
 *   e devolve SUBSCRIPTION_ALREADY_PAID), ou re-gera via createPixPayment com o
 *   mesmo valor/descrição, atualizando external_id e persistindo o Pix.
 * @returns {Promise<{subscription, payment, pix: {qr_code, qr_code_base64}}>}
 */
async function payPlanSubscription(subscriptionId, userId) {
  const subscription = await db.PlanSubscription.findByPk(subscriptionId, {
    include: [
      { model: db.Plan, as: 'plan' },
      { model: db.Payment, as: 'payment' },
    ],
  });
  if (!subscription) throw AppError.notFound('Assinatura não encontrada.', 'SUBSCRIPTION_NOT_FOUND');
  if (subscription.user_id !== userId) {
    throw AppError.forbidden('Você não é o dono desta assinatura.', 'NOT_SUBSCRIPTION_OWNER');
  }

  // Já paga/ativa → erro claro.
  if (subscription.status === 'active') {
    throw AppError.conflict('Esta assinatura já está paga.', 'SUBSCRIPTION_ALREADY_PAID');
  }
  if (subscription.status !== 'pending') {
    throw AppError.unprocessable(
      'Só é possível pagar uma assinatura pendente.',
      'SUBSCRIPTION_NOT_PENDING'
    );
  }

  const payment = subscription.payment;
  if (!payment) throw AppError.notFound('Pagamento da assinatura não encontrado.', 'PAYMENT_NOT_FOUND');

  // Payment já aprovado mas assinatura ainda pendente → ativa e sinaliza pago.
  if (APPROVED_STATUSES.has(payment.status)) {
    await _activateApprovedSubscription(subscription, subscription.plan);
    throw AppError.conflict('Esta assinatura já está paga.', 'SUBSCRIPTION_ALREADY_PAID');
  }

  const plan = subscription.plan;
  const description = `Plano ${plan ? plan.name : ''}`.trim();

  // 1) Pix já persistido no payload? Reaproveita.
  let pix = pixFromPayment(payment);

  // 2) Senão, consulta o pagamento existente no MP (por external_id).
  if (!pix && payment.external_id) {
    try {
      const mp = await mercadopago.getPayment(payment.external_id);
      if (mp && APPROVED_STATUSES.has(mp.status)) {
        // Já aprovado no MP → reflete, ativa e sinaliza pago.
        await payment.update({ status: 'approved', paid_at: new Date(), payload: mp });
        await _activateApprovedSubscription(subscription, plan);
        throw AppError.conflict('Esta assinatura já está paga.', 'SUBSCRIPTION_ALREADY_PAID');
      }
      pix = pixFromMpPayment(mp);
      if (pix) {
        await payment.update({ payload: { ...(payment.payload || {}), ...mp, pix } });
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'SUBSCRIPTION_ALREADY_PAID') throw err;
      logger.error('plan.service.payPlanSubscription: falha ao consultar pagamento no MP:', err.message);
    }
  }

  // 3) Ainda sem Pix → gera um novo no MP com o mesmo valor/descrição.
  if (!pix) {
    const user = await db.User.findByPk(payment.user_id);
    let mp = null;
    try {
      mp = await mercadopago.createPixPayment({
        amount: Number(payment.amount),
        description,
        payerEmail: user ? user.email : undefined,
        externalReference: payment.id,
        metadata: {
          payment_id: payment.id,
          plan_id: plan ? plan.id : undefined,
          subscription_id: subscription.id,
        },
      });
    } catch (err) {
      if (err && err.statusCode === 503) {
        throw AppError.conflict('Gateway de pagamento não configurado.', 'GATEWAY_NOT_CONFIGURED');
      }
      throw err;
    }
    pix = pixFromMpPayment(mp);
    await payment.update({
      external_id: mp && mp.id != null ? String(mp.id) : payment.external_id,
      payload: { ...(payment.payload || {}), ...mp, ...(pix ? { pix } : {}) },
    });
  }

  return { subscription, payment, pix: pix || null };
}

/* ------------------------------ Admin (CRUD) ------------------------------ */

function planSlug(name) {
  const base = String(name || 'plano')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = require('crypto').randomUUID().replace(/-/g, '').slice(0, 6);
  return `${base || 'plano'}-${suffix}`;
}

const PLAN_FIELDS = ['name', 'type', 'category_id', 'description', 'price', 'currency', 'duration_days', 'listing_limit', 'features', 'is_active'];

async function adminList() {
  return db.Plan.findAll({
    order: [['created_at', 'DESC']],
    include: [{ model: db.Category, as: 'category', attributes: ['id', 'name'] }],
  });
}

async function adminCreate(data = {}) {
  if (!data.name) throw AppError.unprocessable('name é obrigatório.', 'PLAN_NAME_REQUIRED');
  if (!data.type) throw AppError.unprocessable('type é obrigatório.', 'PLAN_TYPE_REQUIRED');
  const payload = { slug: planSlug(data.name) };
  for (const f of PLAN_FIELDS) if (data[f] !== undefined) payload[f] = data[f];
  return db.Plan.create(payload);
}

async function adminUpdate(id, data = {}) {
  const plan = await db.Plan.findByPk(id);
  if (!plan) throw AppError.notFound('Plano não encontrado.', 'PLAN_NOT_FOUND');
  const updates = {};
  for (const f of PLAN_FIELDS) if (data[f] !== undefined) updates[f] = data[f];
  await plan.update(updates);
  return plan;
}

async function adminRemove(id) {
  const plan = await db.Plan.findByPk(id);
  if (!plan) throw AppError.notFound('Plano não encontrado.', 'PLAN_NOT_FOUND');
  await plan.destroy();
}

module.exports = {
  listActive,
  listMine,
  subscribe,
  payPlanSubscription,
  createRenewalCharge,
  adminList,
  adminCreate,
  adminUpdate,
  adminRemove,
};
