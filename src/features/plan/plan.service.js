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

/** Assinaturas do usuário logado (com o plano incluído). */
async function listMine(userId) {
  return db.PlanSubscription.findAll({
    where: { user_id: userId },
    include: [{ model: db.Plan, as: 'plan' }],
    order: [['created_at', 'DESC']],
  });
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

async function subscribe(planId, userId) {
  const plan = await db.Plan.findByPk(planId);
  if (!plan) throw AppError.notFound('Plano não encontrado.', 'PLAN_NOT_FOUND');
  if (!plan.is_active) throw AppError.conflict('Este plano não está disponível.', 'PLAN_INACTIVE');

  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');

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

  return _createPlanCharge(plan, user, { renewal: true, renewed_from: subscription.id });
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
  createRenewalCharge,
  adminList,
  adminCreate,
  adminUpdate,
  adminRemove,
};
