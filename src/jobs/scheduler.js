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

/**
 * 5. Renovação de planos vencidos: para cada assinatura EXPIRADA (status
 *    'expired', ends_at < now) que ainda NÃO tem uma renovação pendente para o
 *    mesmo user+plan, gera uma nova cobrança de renovação (Payment pending + nova
 *    PlanSubscription pending + Pix via checkout transparente) e notifica o
 *    usuário por e-mail com o link/Pix para pagar.
 *
 *    A REATIVAÇÃO do anúncio NÃO acontece aqui: ela ocorre quando o pagamento da
 *    renovação for aprovado — o webhook chama payment.service._activatePlanSubscription,
 *    que coloca a nova assinatura como 'active' com nova janela (duration_days). A
 *    partir daí o job 4 (expirePaidListings) deixa de pausar os anúncios do vendedor
 *    naquela categoria, pois ele volta a ter cobertura ativa.
 */
async function renewExpiredPlans() {
  const now = new Date();
  const planService = require('../features/plan/plan.service');
  const emailProvider = require('../providers/email/email.provider');
  const settings = require('../services/settings.cache');

  // Assinaturas expiradas (uma consulta), com usuário e plano para a notificação.
  const expired = await db.PlanSubscription.findAll({
    where: {
      status: 'expired',
      ends_at: { [Op.ne]: null, [Op.lt]: now },
    },
    include: [
      { model: db.User, as: 'user', attributes: ['id', 'name', 'email'] },
      { model: db.Plan, as: 'plan', attributes: ['id', 'name', 'price', 'currency', 'is_active'] },
    ],
    order: [['ends_at', 'ASC']],
  });
  if (!expired.length) return;

  // Pré-carrega as renovações pendentes recentes (evita N+1 na idempotência):
  // mapa "user_id:plan_id" -> true para os pares que já têm pendência.
  const window = new Date(now.getTime() - 7 * 24 * HOUR_MS);
  const pendingRows = await db.PlanSubscription.findAll({
    attributes: ['user_id', 'plan_id'],
    where: { status: 'pending', created_at: { [Op.gt]: window } },
    raw: true,
  });
  const pendingPairs = new Set(pendingRows.map((r) => `${r.user_id}:${r.plan_id}`));

  // Evita gerar duas renovações para o mesmo par no mesmo lote (caso haja várias
  // assinaturas expiradas do mesmo user+plan).
  const handled = new Set();
  const webUrl = (await settings.get('app.web_url', '')) || '';

  let generated = 0;
  for (const sub of expired) {
    const pairKey = `${sub.user_id}:${sub.plan_id}`;
    if (pendingPairs.has(pairKey) || handled.has(pairKey)) continue;
    handled.add(pairKey);

    try {
      const result = await planService.createRenewalCharge(sub);
      if (result && result.skipped) continue;
      generated += 1;

      // Notifica o usuário por e-mail (best-effort, não derruba o lote).
      const user = sub.user;
      if (user && user.email) {
        const planName = (sub.plan && sub.plan.name) || 'seu plano';
        const payUrl = webUrl ? `${webUrl.replace(/\/+$/, '')}/pedido/${result.payment.id}` : null;
        const pixCode = result.pix && (result.pix.qr_code || (result.pix.point_of_interaction
          && result.pix.point_of_interaction.transaction_data
          && result.pix.point_of_interaction.transaction_data.qr_code)) || null;

        const vars = {
          name: user.name || '',
          plan_name: planName,
          pay_url: payUrl || '',
          pix_code: pixCode || '',
        };
        const linkBlock = payUrl
          ? `<p>Para renovar, acesse: <a href="${payUrl}">${payUrl}</a></p>`
          : '';
        const pixBlock = pixCode
          ? `<p>Ou pague via Pix copia e cola:</p><pre style="white-space:pre-wrap;word-break:break-all">${pixCode}</pre>`
          : '';

        await emailProvider.sendEmail({
          to: user.email,
          toName: user.name || undefined,
          templateKey: 'plan_renewal_charge',
          vars,
          subject: `Seu plano "${planName}" venceu — renove agora`,
          html:
            `<p>Olá${user.name ? ` ${user.name}` : ''},</p>` +
            `<p>Seu plano <strong>${planName}</strong> venceu. Geramos uma nova cobrança de renovação para você continuar com seus anúncios ativos.</p>` +
            linkBlock +
            pixBlock +
            `<p>Assim que o pagamento for confirmado, seu plano e seus anúncios voltam a ficar ativos automaticamente.</p>`,
        });
      }
    } catch (err) {
      logger.error(`Renovação de plano falhou para assinatura ${sub.id}:`, err.message);
    }
  }

  if (generated) {
    logger.info(`Renovações: ${generated} cobrança(s) de renovação gerada(s) e notificada(s).`);
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

  // 5. Renovar planos vencidos — 1x/dia às 09:30.
  cron.schedule('30 9 * * *', async () => {
    try {
      await renewExpiredPlans();
    } catch (err) {
      logger.error('Job de renovação de planos vencidos falhou:', err.message);
    }
  });

  logger.info(
    'Scheduler iniciado (escrow, expiração de destaques, bump, assinaturas, anúncios pagos e renovação de planos).'
  );
}

module.exports = { start };
