'use strict';

/**
 * Serviço de Produtos (anúncios) e upsell de Destaque (highlight).
 * - Listagem pública mostra apenas status='active', com destaques primeiro.
 * - Compra de destaque gera Payment (Pix imediato via Mercado Pago) + registro
 *   pendente em product_highlights; a ativação ocorre quando o pagamento é
 *   aprovado (chamado pelo webhook de pagamentos).
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const settings = require('../../services/settings.cache');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');
const logger = require('../../utils/logger');

const HIGHLIGHT_TIERS = ['silver', 'gold', 'diamond'];

/** Ordem de prioridade de destaque para ordenação (diamond > gold > silver > none). */
const TIER_RANK = { diamond: 3, gold: 2, silver: 1, none: 0 };

/** Gera slug: minúsculas, sem acentos, não-alfanumérico vira '-', sufixo aleatório. */
function slugify(text) {
  const base = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `${base || 'produto'}-${suffix}`;
}

function sellerInclude() {
  return {
    model: db.User,
    as: 'seller',
    attributes: ['id', 'name', 'avatar_url'],
  };
}

/**
 * Listagem paginada de produtos.
 * Pública (sem status explícito) mostra apenas 'active'.
 */
// Expressão do preço efetivo (promocional quando houver).
const PRICE_EXPR = () => db.sequelize.literal('COALESCE(promotional_price, price)');
// Título sem acento (para busca tolerante a acento).
const TITLE_UNACCENT =
  "translate(lower(title), 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ', 'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')";

/** Remove acentos e baixa caixa de um termo (lado JS). */
function unaccent(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Ordenação por `sort`. */
function buildOrder(sort) {
  switch (sort) {
    case 'recent':
      return [['created_at', 'DESC']];
    case 'price_asc':
      return [[PRICE_EXPR(), 'ASC']];
    case 'price_desc':
      return [[PRICE_EXPR(), 'DESC']];
    case 'best_selling':
      return [['favorites_count', 'DESC'], ['views_count', 'DESC'], ['created_at', 'DESC']];
    default: // relevância: destaques primeiro, vendedor Premium em seguida, depois recentes
      return [
        [db.sequelize.literal("CASE highlight_tier WHEN 'diamond' THEN 3 WHEN 'gold' THEN 2 WHEN 'silver' THEN 1 ELSE 0 END"), 'DESC'],
        // Vendedor Premium ganha visibilidade extra na busca geral (paga 12% de comissão).
        [db.sequelize.literal(`CASE WHEN "seller"."seller_tier" = 'premium' THEN 1 ELSE 0 END`), 'DESC'],
        ['favorites_count', 'DESC'],
        ['published_at', 'DESC'],
        ['created_at', 'DESC'],
      ];
  }
}

/** Facetas (categorias, faixa de preço, condição, estado) para a sidebar. */
async function computeFacets(where) {
  const COUNT = [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'];
  const [agg, conds, states, cats] = await Promise.all([
    db.Product.findOne({ where, attributes: [[db.sequelize.fn('MIN', PRICE_EXPR()), 'min'], [db.sequelize.fn('MAX', PRICE_EXPR()), 'max']], raw: true }),
    db.Product.findAll({ where, attributes: ['condition', COUNT], group: ['condition'], raw: true }),
    db.Product.findAll({ where, attributes: ['state', COUNT], group: ['state'], raw: true }),
    db.Product.findAll({ where, attributes: ['category_id', COUNT], group: ['category_id'], order: [[db.sequelize.fn('COUNT', db.sequelize.col('id')), 'DESC']], limit: 12, raw: true }),
  ]);
  const catIds = cats.map((c) => c.category_id).filter(Boolean);
  const catRows = catIds.length ? await db.Category.findAll({ where: { id: catIds }, attributes: ['id', 'name'], raw: true }) : [];
  const nameById = Object.fromEntries(catRows.map((c) => [c.id, c.name]));
  return {
    priceMin: agg && agg.min != null ? Math.floor(Number(agg.min)) : 0,
    priceMax: agg && agg.max != null ? Math.ceil(Number(agg.max)) : 0,
    conditions: conds.filter((c) => c.condition).map((c) => ({ value: c.condition, count: Number(c.count) })),
    states: states.filter((s) => s.state).map((s) => ({ value: s.state, count: Number(s.count) })),
    categories: cats.filter((c) => c.category_id).map((c) => ({ id: c.category_id, name: nameById[c.category_id] || '—', count: Number(c.count) })),
  };
}

async function list(params = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const where = {};
  const and = [];

  // Categoria por id ou slug.
  if (params.category_id) {
    where.category_id = params.category_id;
  } else if (params.slug) {
    const category = await db.Category.findOne({ where: { slug: params.slug } });
    where.category_id = category ? category.id : '00000000-0000-0000-0000-000000000000';
  }

  if (params.seller_id) where.seller_id = params.seller_id;
  where.status = params.status || 'active';
  if (params.highlight_tier) where.highlight_tier = params.highlight_tier;

  // Busca tolerante a acento (translate no SQL + termo sem acento no JS).
  const term = (params.q != null ? params.q : params.search) || '';
  if (String(term).trim()) {
    and.push(db.sequelize.where(db.sequelize.literal(TITLE_UNACCENT), { [Op.iLike]: `%${unaccent(term)}%` }));
  }

  // Faixa de preço (sobre o preço efetivo).
  if (params.price_min != null && params.price_min !== '') and.push(db.sequelize.where(PRICE_EXPR(), { [Op.gte]: Number(params.price_min) }));
  if (params.price_max != null && params.price_max !== '') and.push(db.sequelize.where(PRICE_EXPR(), { [Op.lte]: Number(params.price_max) }));

  // Condição (nova/usada/recondicionada) — aceita lista separada por vírgula.
  if (params.condition) {
    const conds = String(params.condition).split(',').map((s) => s.trim()).filter(Boolean);
    if (conds.length) where.condition = { [Op.in]: conds };
  }
  // Estado (UF).
  if (params.state) where.state = String(params.state).toUpperCase();

  // Filtro geográfico por bounding box (lat/lng/radius em km).
  if (params.lat != null && params.lng != null && params.radius != null) {
    const lat = Number(params.lat);
    const lng = Number(params.lng);
    const radius = Number(params.radius);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Number.isFinite(radius) && radius > 0) {
      const latDelta = radius / 111;
      const lngDelta = radius / (111 * Math.cos((lat * Math.PI) / 180) || 1);
      where.latitude = { [Op.between]: [lat - latDelta, lat + latDelta] };
      where.longitude = { [Op.between]: [lng - lngDelta, lng + lngDelta] };
    }
  }

  if (and.length) where[Op.and] = and;

  const { rows, count } = await db.Product.findAndCountAll({
    where,
    include: [sellerInclude(), { model: db.Category, as: 'category' }],
    order: buildOrder(params.sort),
    limit,
    offset,
    distinct: true,
  });

  let facets = null;
  if (params.facets) {
    try {
      facets = await computeFacets(where);
    } catch (e) {
      facets = null;
    }
  }

  return { rows, total: count, facets };
}

/** Detalhe por id; incrementa views_count quando acesso público (`incrementViews`). */
async function getById(id, { incrementViews = false } = {}) {
  const product = await db.Product.findByPk(id, {
    include: [sellerInclude(), { model: db.Category, as: 'category' }],
  });
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  if (incrementViews) {
    await product.increment('views_count', { by: 1 });
    product.views_count = (product.views_count || 0) + 1;
  }
  return product;
}

async function create(sellerId, data = {}) {
  // Enforce de banimento por escopo: vendedor banido de 'selling' ou 'full' não anuncia.
  const banScopes = await require('../user/user.service').getActiveBanScopes(sellerId);
  if (banScopes.includes('selling') || banScopes.includes('full')) {
    throw AppError.forbidden('Você está impedido de anunciar.', 'BANNED_SELLING');
  }

  if (!data.title) throw AppError.unprocessable('title é obrigatório.', 'PRODUCT_TITLE_REQUIRED');

  const price = data.price != null ? Number(data.price) : 0;
  if (!Number.isFinite(price) || price < 0) {
    throw AppError.unprocessable('price deve ser maior ou igual a zero.', 'PRODUCT_INVALID_PRICE');
  }
  if (!data.category_id) {
    throw AppError.unprocessable('category_id é obrigatório.', 'PRODUCT_CATEGORY_REQUIRED');
  }

  const category = await db.Category.findByPk(data.category_id);
  if (!category) throw AppError.unprocessable('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');

  // Regras de negócio por categoria (config dinâmica), considerando a HIERARQUIA
  // (a regra vale para a categoria e todos os seus ancestrais).
  const chain = [];
  {
    let cid = category.id;
    let guard = 0;
    while (cid && guard < 20) {
      const c =
        guard === 0
          ? category
          : await db.Category.findByPk(cid, { attributes: ['id', 'parent_id', 'requires_geolocation'] });
      if (!c) break;
      chain.push(c);
      cid = c.parent_id;
      guard += 1;
    }
  }
  const chainIds = chain.map((c) => c.id);

  // Imóveis/Veículos: exige assinatura ativa de um plano que cobre a categoria
  // (plano com category_id na cadeia) ou um plano global (category_id null).
  const requiresPlan = await db.CategoryPricing.count({
    where: { category_id: { [Op.in]: chainIds }, requires_plan: true },
  });
  if (requiresPlan > 0) {
    const sub = await db.PlanSubscription.findOne({
      where: { user_id: sellerId, status: 'active' },
      include: [
        {
          model: db.Plan,
          as: 'plan',
          required: true,
          where: { [Op.or]: [{ category_id: { [Op.in]: chainIds } }, { category_id: null }] },
        },
      ],
    });
    if (!sub) {
      throw AppError.forbidden(
        'Esta categoria exige um plano ativo para anunciar. Adquira um plano para publicar aqui.',
        'PLAN_REQUIRED'
      );
    }
  }

  // Causa Animal e afins: geolocalização obrigatória (para plotar no mapa).
  if (chain.some((c) => c.requires_geolocation) && (data.latitude == null || data.longitude == null)) {
    throw AppError.unprocessable(
      'Esta categoria exige a sua localização (latitude e longitude).',
      'GEO_REQUIRED'
    );
  }

  return db.Product.create({
    seller_id: sellerId,
    category_id: data.category_id,
    title: data.title,
    slug: slugify(data.title),
    description: data.description || null,
    price,
    promotional_price: data.promotional_price != null ? Number(data.promotional_price) : null,
    currency: data.currency || 'BRL',
    condition: data.condition || null,
    stock: data.stock != null ? Number(data.stock) : 1,
    sku: data.sku || null,
    // Publica direto ao criar (o vendedor clicou em "Publicar"). Antes nascia
    // 'draft' e o anúncio não aparecia na vitrine.
    status: 'active',
    published_at: new Date(),
    specifications: data.specifications || null,
    variations: data.variations || null,
    images: data.images || null,
    cover_image_url: data.cover_image_url || null,
    requires_shipping: data.requires_shipping !== undefined ? data.requires_shipping === true : true,
    weight_grams: data.weight_grams != null ? Number(data.weight_grams) : null,
    dimensions: data.dimensions || null,
    latitude: data.latitude != null ? data.latitude : null,
    longitude: data.longitude != null ? data.longitude : null,
    city: data.city || null,
    state: data.state || null,
    metadata: data.metadata || null,
  });
}

/** Carrega o produto e valida a propriedade (dono ou admin). */
async function loadOwned(id, userId, { isAdmin = false } = {}) {
  const product = await db.Product.findByPk(id);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  if (!isAdmin && product.seller_id !== userId) {
    throw AppError.forbidden('Você não é o dono deste anúncio.', 'NOT_PRODUCT_OWNER');
  }
  return product;
}

async function update(id, sellerId, data = {}, { isAdmin = false } = {}) {
  const product = await loadOwned(id, sellerId, { isAdmin });

  if (data.price !== undefined) {
    const price = Number(data.price);
    if (!Number.isFinite(price) || price < 0) {
      throw AppError.unprocessable('price deve ser maior ou igual a zero.', 'PRODUCT_INVALID_PRICE');
    }
  }
  if (data.category_id !== undefined) {
    const category = await db.Category.findByPk(data.category_id);
    if (!category) throw AppError.unprocessable('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  }

  const patch = {};
  const fields = [
    'category_id',
    'title',
    'description',
    'price',
    'promotional_price',
    'currency',
    'condition',
    'stock',
    'sku',
    'specifications',
    'variations',
    'images',
    'cover_image_url',
    'requires_shipping',
    'weight_grams',
    'dimensions',
    'latitude',
    'longitude',
    'city',
    'state',
    'metadata',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) patch[f] = data[f];
  }
  if (data.title !== undefined) patch.slug = slugify(data.title);

  await product.update(patch);
  return product;
}

async function publish(id, sellerId, { isAdmin = false } = {}) {
  const product = await loadOwned(id, sellerId, { isAdmin });
  await product.update({ status: 'active', published_at: new Date() });
  return product;
}

/** Moderação admin: define o status do anúncio (aprovar/rejeitar). */
async function setStatus(id, status) {
  const allowed = ['draft', 'pending_review', 'active', 'paused', 'sold', 'rejected', 'archived'];
  if (!allowed.includes(status)) {
    throw AppError.unprocessable(`status inválido. Valores: ${allowed.join(', ')}.`, 'INVALID_STATUS');
  }
  const product = await db.Product.findByPk(id);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  const patch = { status };
  if (status === 'active' && !product.published_at) patch.published_at = new Date();
  await product.update(patch);
  return product;
}

/** Soft delete (paranoid). */
async function remove(id, sellerId, { isAdmin = false } = {}) {
  const product = await loadOwned(id, sellerId, { isAdmin });
  await product.destroy();
  return product;
}

/* -------------------------------- highlight ------------------------------- */

const APPROVED_STATUSES = new Set(['approved', 'authorized']);

/** Primeiro nome do usuário (para o Customer do MP). */
function firstName(user) {
  return String(user.name || '').trim().split(/\s+/)[0] || undefined;
}

/**
 * Salva um cartão padrão para o usuário a partir do token do checkout transparente
 * (espelha plan.service._saveCardForUser). Retorna o registro SavedCard.
 */
async function _saveCardForUser(user, card) {
  const customer = await mercadopago.findOrCreateCustomer({ email: user.email, firstName: firstName(user) });
  const saved = await mercadopago.saveCardToCustomer({ customerId: customer.id, token: card.token });
  await db.SavedCard.update({ is_default: false }, { where: { user_id: user.id } });
  return db.SavedCard.create({
    user_id: user.id,
    mp_customer_id: customer.id,
    mp_card_id: saved.id,
    last_four: saved.last_four_digits || null,
    brand: (saved.payment_method && (saved.payment_method.name || saved.payment_method.id)) || card.payment_method_id || null,
    is_default: true,
  });
}

/**
 * Compra de destaque no CARTÃO (espelha plan.service._chargePlanWithCard).
 * Cria Payment + ProductHighlight pendentes, cobra no MP e — se aprovado —
 * ativa o destaque na hora (mesmo caminho do webhook).
 */
async function _chargeHighlightWithCard(product, user, tier, pkg, card) {
  let savedCard = card.savedCard || null;
  if (!savedCard && card.save_card && card.token) {
    savedCard = await _saveCardForUser(user, card);
  }

  const { payment, highlight } = await db.sequelize.transaction(async (transaction) => {
    const payment = await db.Payment.create(
      {
        user_id: user.id,
        purpose: 'highlight',
        provider: 'mercado_pago',
        method: 'credit_card',
        amount: pkg.price,
        status: 'pending',
        currency: 'BRL',
        installments: 1,
      },
      { transaction }
    );
    const highlight = await db.ProductHighlight.create(
      {
        product_id: product.id,
        user_id: user.id,
        tier,
        price: pkg.price,
        currency: 'BRL',
        status: 'pending',
        payment_id: payment.id,
        starts_at: null,
        ends_at: null,
      },
      { transaction }
    );
    return { payment, highlight };
  });

  let mpPayment = null;
  let note = null;
  try {
    if (savedCard) {
      mpPayment = await mercadopago.chargeSavedCard({
        customerId: savedCard.mp_customer_id,
        cardId: savedCard.mp_card_id,
        amount: pkg.price,
        description: `Destaque ${tier}`,
        payerEmail: user.email,
        paymentMethodId: card.payment_method_id || savedCard.brand || undefined,
        externalReference: payment.id,
        idempotencyKey: `highlight-card-${payment.id}`,
        metadata: { payment_id: payment.id, highlight_id: highlight.id },
      });
    } else {
      mpPayment = await mercadopago.createPayment({
        amount: pkg.price,
        description: `Destaque ${tier}`,
        payerEmail: user.email,
        payerFirstName: firstName(user),
        token: card.token,
        paymentMethodId: card.payment_method_id,
        installments: 1,
        externalReference: payment.id,
        idempotencyKey: `highlight-card-${payment.id}`,
        metadata: { payment_id: payment.id, highlight_id: highlight.id },
      });
    }
  } catch (err) {
    logger.error(`product.service: cobrança no cartão falhou para pagamento ${payment.id}:`, err.message);
    note = 'Falha ao processar o cartão. Tente novamente ou use Pix.';
    return { payment, highlight, approved: false, note };
  }

  const approved = APPROVED_STATUSES.has(mpPayment && mpPayment.status);
  try {
    await payment.update({
      external_id: mpPayment && mpPayment.id != null ? String(mpPayment.id) : payment.external_id,
      status: approved ? 'approved' : 'rejected',
      paid_at: approved ? new Date() : null,
      payload: mpPayment || payment.payload,
    });
  } catch (err) {
    logger.error('product.service: falha ao atualizar Payment após cobrança no cartão:', err.message);
  }

  if (approved) {
    try {
      await activateHighlight(highlight.id);
    } catch (err) {
      logger.error('product.service: falha ao ativar destaque aprovado por cartão:', err.message);
    }
  }

  return { payment, highlight, approved, note };
}

/**
 * Compra de destaque. Sem cartão = Pix imediato (comportamento original): cria
 * Payment pendente + ProductHighlight pendente e gera o Pix no gateway. Com
 * `opts.card` = débito no cartão (e ativa na hora se aprovado).
 */
async function purchaseHighlight(productId, userId, { tier, card } = {}) {
  if (!tier || !HIGHLIGHT_TIERS.includes(tier)) {
    throw AppError.unprocessable(
      `tier inválido. Valores: ${HIGHLIGHT_TIERS.join(', ')}.`,
      'INVALID_HIGHLIGHT_TIER'
    );
  }

  const product = await db.Product.findByPk(productId);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  if (product.seller_id !== userId) {
    throw AppError.forbidden('Você não é o dono deste anúncio.', 'NOT_PRODUCT_OWNER');
  }

  const pkg = await settings.highlight(tier);
  if (!pkg) {
    throw AppError.notFound('Pacote de destaque indisponível.', 'HIGHLIGHT_PACKAGE_NOT_FOUND');
  }

  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');

  // Cartão → débito imediato (ativa na hora se aprovado).
  if (card && card.token) {
    const result = await _chargeHighlightWithCard(product, user, tier, pkg, card);
    return {
      payment: result.payment,
      highlight: result.highlight,
      approved: result.approved,
      method: 'credit_card',
      note: result.note || null,
    };
  }

  // Sem cartão → Pix (comportamento original).
  return db.sequelize.transaction(async (transaction) => {
    const payment = await db.Payment.create(
      {
        user_id: userId,
        purpose: 'highlight',
        provider: 'mercado_pago',
        method: 'pix',
        amount: pkg.price,
        status: 'pending',
        currency: 'BRL',
      },
      { transaction }
    );

    const highlight = await db.ProductHighlight.create(
      {
        product_id: productId,
        user_id: userId,
        tier,
        price: pkg.price,
        currency: 'BRL',
        status: 'pending',
        payment_id: payment.id,
        starts_at: null,
        ends_at: null,
      },
      { transaction }
    );

    let pix = null;
    let note = null;
    try {
      pix = await mercadopago.createPixPayment({
        amount: pkg.price,
        description: `Destaque ${tier}`,
        payerEmail: user.email,
        externalReference: payment.id,
      });
    } catch (err) {
      if (err && err.statusCode === 503) {
        note = 'Gateway de pagamento não configurado. Pagamento criado como pendente.';
      } else {
        throw err;
      }
    }

    return { payment, highlight, pix, note };
  });
}

/** Catálogo público dos pacotes de destaque (preços/vigência reais do admin). */
async function listHighlightPackages() {
  const pkgs = await settings.highlightPackages();
  return (Array.isArray(pkgs) ? pkgs : [])
    .map((p) => ({
      tier: p.tier,
      name: p.name,
      price: Number(p.price),
      duration_days: Number(p.duration_days),
      sort_order: Number(p.sort_order) || 0,
    }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

/**
 * Histórico/status de destaque de um produto (dono ou admin).
 * - current: destaque ativo (Product.highlight_tier != 'none' + expira no futuro,
 *   ou ProductHighlight status 'active').
 * - history: todos os ProductHighlight (mais recentes primeiro), com o status do
 *   Payment associado (para mostrar o que está pago/pendente).
 */
async function listHighlights(productId, user) {
  const product = await db.Product.findByPk(productId);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  const isAdmin = !!(user && (user.is_admin === true || user.admin_role));
  if (!isAdmin && (!user || product.seller_id !== user.id)) {
    throw AppError.forbidden('Você não é o dono deste anúncio.', 'NOT_PRODUCT_OWNER');
  }

  const rows = await db.ProductHighlight.findAll({
    where: { product_id: productId },
    include: [{ model: db.Payment, as: 'payment', attributes: ['id', 'status', 'method'] }],
    order: [['created_at', 'DESC']],
  });

  const PAID_STATUSES = ['approved', 'authorized'];
  const history = rows.map((h) => {
    const payment = h.payment || null;
    return {
      id: h.id,
      tier: h.tier,
      status: h.status,
      price: h.price != null ? Number(h.price) : null,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
      created_at: h.created_at,
      paid: !!(payment && PAID_STATUSES.includes(payment.status)),
      payment: payment
        ? { id: payment.id, status: payment.status, method: payment.method }
        : null,
    };
  });

  // current: prioriza o estado consolidado no produto; senão, um highlight 'active'.
  let current = null;
  const now = Date.now();
  if (
    product.highlight_tier &&
    product.highlight_tier !== 'none' &&
    (!product.highlight_expires_at || new Date(product.highlight_expires_at).getTime() > now)
  ) {
    current = { tier: product.highlight_tier, ends_at: product.highlight_expires_at };
  } else {
    const active = rows.find(
      (h) => h.status === 'active' && (!h.ends_at || new Date(h.ends_at).getTime() > now)
    );
    if (active) current = { tier: active.tier, ends_at: active.ends_at };
  }

  return { current, history };
}

/**
 * Ativa o destaque após aprovação do pagamento (chamado pelo webhook).
 * Define active + janela de vigência e propaga para o produto.
 * Aceita um id de ProductHighlight, um Payment (objeto) ou um payment_id.
 */
async function activateHighlight(ref) {
  // Resolve o ProductHighlight a partir de um payment (webhook passa o Payment),
  // de um payment_id ou diretamente de um highlight id.
  let highlight = null;
  const refId = ref && typeof ref === 'object' ? ref.id : ref;
  if (ref && typeof ref === 'object' && ref.purpose === 'highlight') {
    highlight = await db.ProductHighlight.findOne({ where: { payment_id: ref.id } });
  }
  if (!highlight && refId) {
    highlight =
      (await db.ProductHighlight.findOne({ where: { payment_id: refId } })) ||
      (await db.ProductHighlight.findByPk(refId));
  }
  if (!highlight) throw AppError.notFound('Destaque não encontrado.', 'HIGHLIGHT_NOT_FOUND');

  // Idempotência: já ativado (ex.: cartão ativou e o webhook chegou depois).
  if (highlight.status === 'active') return highlight;

  const pkg = await settings.highlight(highlight.tier);
  const durationDays = pkg && pkg.duration_days ? Number(pkg.duration_days) : 7;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);

  return db.sequelize.transaction(async (transaction) => {
    await highlight.update(
      { status: 'active', starts_at: startsAt, ends_at: endsAt },
      { transaction }
    );

    const product = await db.Product.findByPk(highlight.product_id, { transaction });
    if (product) {
      await product.update(
        { highlight_tier: highlight.tier, highlight_expires_at: endsAt },
        { transaction }
      );
    }

    return highlight;
  });
}

module.exports = {
  slugify,
  TIER_RANK,
  list,
  getById,
  create,
  update,
  publish,
  setStatus,
  remove,
  purchaseHighlight,
  activateHighlight,
  listHighlightPackages,
  listHighlights,
};
