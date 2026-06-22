'use strict';

/**
 * Agendador de tarefas (node-cron). Hoje: liberação automática de escrow cujo
 * prazo de retenção (7 dias) venceu e sem disputa aberta. Roda de hora em hora.
 */
const cron = require('node-cron');
const { Op } = require('sequelize');
const db = require('../models');
const logger = require('../utils/logger');

const HOUR_MS = 60 * 60 * 1000;

/**
 * 1. Expira destaques (highlight) vencidos: zera o tier vigente do produto e
 *    marca os product_highlights ativos correspondentes como 'expired'.
 */
async function expireHighlights() {
  const now = new Date();

  // Produtos que ainda têm tier mas cujo destaque venceu.
  const expiringProducts = await db.Product.findAll({
    attributes: ['id'],
    where: {
      highlight_tier: { [Op.ne]: 'none' },
      highlight_expires_at: { [Op.lt]: now },
    },
    raw: true,
  });

  const [productCount] = await db.Product.update(
    { highlight_tier: 'none', highlight_expires_at: null },
    {
      where: {
        highlight_tier: { [Op.ne]: 'none' },
        highlight_expires_at: { [Op.lt]: now },
      },
    }
  );

  // Marca os registros de destaque ativos como expirados (status do enum).
  let highlightCount = 0;
  const productIds = expiringProducts.map((p) => p.id);
  if (productIds.length) {
    [highlightCount] = await db.ProductHighlight.update(
      { status: 'expired' },
      {
        where: {
          product_id: { [Op.in]: productIds },
          status: 'active',
        },
      }
    );
  }
  // Também expira product_highlights cujo ends_at venceu mesmo sem produto pego acima.
  const [highlightByEnds] = await db.ProductHighlight.update(
    { status: 'expired' },
    {
      where: {
        status: 'active',
        ends_at: { [Op.ne]: null, [Op.lt]: now },
      },
    }
  );

  if (productCount || highlightCount || highlightByEnds) {
    logger.info(
      `Destaques: ${productCount} produto(s) com tier zerado, ` +
        `${highlightCount + highlightByEnds} product_highlight(s) marcado(s) como expirado(s).`
    );
  }
}

/**
 * 2. "Volta ao topo" (bump): produtos com destaque ATIVO sobem republicando
 *    published_at conforme a cadência do tier.
 *    - diamond: 1x/dia (>= 24h desde o último published_at)
 *    - silver : 1x a cada 3 dias (>= 72h)
 *    - gold   : NÃO faz bump (ganho do Ouro é o tier, não a volta ao topo).
 */
async function bumpHighlights() {
  const now = new Date();
  const diamondThreshold = new Date(now.getTime() - 24 * HOUR_MS);
  const silverThreshold = new Date(now.getTime() - 72 * HOUR_MS);

  const [diamondCount] = await db.Product.update(
    { published_at: now },
    {
      where: {
        highlight_tier: 'diamond',
        highlight_expires_at: { [Op.gt]: now },
        published_at: { [Op.lt]: diamondThreshold },
      },
    }
  );

  const [silverCount] = await db.Product.update(
    { published_at: now },
    {
      where: {
        highlight_tier: 'silver',
        highlight_expires_at: { [Op.gt]: now },
        published_at: { [Op.lt]: silverThreshold },
      },
    }
  );

  if (diamondCount || silverCount) {
    logger.info(
      `Bump (volta ao topo): ${diamondCount} diamond + ${silverCount} silver = ` +
        `${diamondCount + silverCount} anúncio(s) republicado(s).`
    );
  }
}

/**
 * 3. Expira assinaturas de plano ativas cujo ends_at venceu.
 */
async function expirePlanSubscriptions() {
  const now = new Date();
  const [count] = await db.PlanSubscription.update(
    { status: 'expired' },
    {
      where: {
        status: 'active',
        ends_at: { [Op.ne]: null, [Op.lt]: now },
      },
    }
  );
  if (count) {
    logger.info(`Assinaturas: ${count} plan_subscription(s) expirada(s).`);
  }
}

/**
 * 4. Expira anúncios ativos em categorias que exigem plano (CategoryPricing.
 *    requires_plan = true) quando o vendedor NÃO tem assinatura ativa válida
 *    que cubra a categoria (plan.category_id == categoria do produto OU null =
 *    plano geral). 'expired' não existe no enum de status do produto, então
 *    usamos 'paused'. Cruzamento feito em memória para evitar N+1.
 */
async function expirePaidListings() {
  const now = new Date();

  // Categorias que exigem plano (uma consulta).
  const paidPricing = await db.CategoryPricing.findAll({
    attributes: ['category_id'],
    where: { requires_plan: true, is_active: true },
    raw: true,
  });
  if (!paidPricing.length) return; // nada a fazer, sai rápido.

  const paidCategoryIds = paidPricing.map((p) => p.category_id);

  // Produtos ativos nessas categorias.
  const products = await db.Product.findAll({
    attributes: ['id', 'seller_id', 'category_id'],
    where: {
      status: 'active',
      category_id: { [Op.in]: paidCategoryIds },
    },
    raw: true,
  });
  if (!products.length) return;

  const sellerIds = [...new Set(products.map((p) => p.seller_id))];

  // Assinaturas ativas válidas dos vendedores envolvidos, com o plano (category_id).
  const subscriptions = await db.PlanSubscription.findAll({
    where: {
      user_id: { [Op.in]: sellerIds },
      status: 'active',
      ends_at: { [Op.gt]: now },
    },
    include: [{ model: db.Plan, as: 'plan', attributes: ['category_id'] }],
  });

  // Mapa: seller_id -> { general: bool, categories: Set }
  const coverage = new Map();
  for (const sub of subscriptions) {
    const planCategoryId = sub.plan ? sub.plan.category_id : null;
    let entry = coverage.get(sub.user_id);
    if (!entry) {
      entry = { general: false, categories: new Set() };
      coverage.set(sub.user_id, entry);
    }
    if (planCategoryId === null || planCategoryId === undefined) {
      entry.general = true; // plano geral cobre qualquer categoria
    } else {
      entry.categories.add(planCategoryId);
    }
  }

  // Produtos sem cobertura → expirar (paused).
  const toExpire = products
    .filter((p) => {
      const entry = coverage.get(p.seller_id);
      if (!entry) return true; // vendedor sem assinatura ativa
      if (entry.general) return false; // plano geral cobre
      return !entry.categories.has(p.category_id);
    })
    .map((p) => p.id);

  if (!toExpire.length) return;

  const [count] = await db.Product.update(
    { status: 'paused' },
    { where: { id: { [Op.in]: toExpire } } }
  );
  if (count) {
    logger.info(
      `Anúncios pagos: ${count} produto(s) pausado(s) por falta de plano ativo na categoria.`
    );
  }
}

function start() {
  // A cada hora, no minuto 5.
  cron.schedule('5 * * * *', async () => {
    try {
      const escrowService = require('../features/escrow/escrow.service');
      const released = await escrowService.releaseDue();
      if (released && released.length) {
        logger.info(`Escrow: ${released.length} custódia(s) liberada(s) automaticamente.`);
      }
    } catch (err) {
      logger.error('Job de liberação de escrow falhou:', err.message);
    }
  });

  // 1. Expirar destaques vencidos — de hora em hora (minuto 10).
  cron.schedule('10 * * * *', async () => {
    try {
      await expireHighlights();
    } catch (err) {
      logger.error('Job de expiração de destaques falhou:', err.message);
    }
  });

  // 2. Volta ao topo (bump) — de hora em hora (minuto 15).
  cron.schedule('15 * * * *', async () => {
    try {
      await bumpHighlights();
    } catch (err) {
      logger.error('Job de bump de destaques falhou:', err.message);
    }
  });

  // 3. Expirar assinaturas de plano — de hora em hora (minuto 20).
  cron.schedule('20 * * * *', async () => {
    try {
      await expirePlanSubscriptions();
    } catch (err) {
      logger.error('Job de expiração de assinaturas falhou:', err.message);
    }
  });

  // 4. Expirar anúncios pagos sem plano ativo — de hora em hora (minuto 25).
  cron.schedule('25 * * * *', async () => {
    try {
      await expirePaidListings();
    } catch (err) {
      logger.error('Job de expiração de anúncios pagos falhou:', err.message);
    }
  });

  logger.info(
    'Scheduler iniciado (escrow, expiração de destaques, bump, assinaturas e anúncios pagos).'
  );
}

module.exports = { start };
