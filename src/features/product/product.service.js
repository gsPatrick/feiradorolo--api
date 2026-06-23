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
const { computeVerificationLevel } = require('../../utils/verificationLevel');

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
    // Campos extras necessários para computar reputação/verificação/selo do vendedor.
    attributes: [
      'id',
      'name',
      'avatar_url',
      'seller_tier',
      'account_status',
      'email_verified_at',
      'phone_verified_at',
      'document_verified_at',
      'seller_verification_status',
      'created_at',
    ],
  };
}

/* -------------------------- reputação / vendedor -------------------------- */
// Limiares (constantes nomeadas) para o cálculo de selos do vendedor.
const LEADER_MIN_SALES = 30;
const LEADER_MIN_RATING = 4.5;
const PLATINUM_MIN_SALES = 100;
const PLATINUM_MIN_RATING = 4.7;

// Nível de verificação 0–3 do vendedor: centralizado em utils/verificationLevel
// (0=nada, 1=email/telefone, 2=document_verified_at, 3=facial aprovada).

/** Mapeia account_status (active|pending|suspended|banned) → status público. */
function mapSellerStatus(accountStatus) {
  switch (accountStatus) {
    case 'banned':
      return 'banned';
    case 'suspended':
    case 'pending':
      return 'suspended';
    default:
      return 'active';
  }
}

/**
 * Agrega reviews aprovadas por produto. Recebe lista de productIds e devolve
 * um Map id → { rating (média), count }. Uma única query agrupada (sem N+1).
 */
async function reviewStatsByProduct(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await db.Review.findAll({
    where: { product_id: { [Op.in]: ids }, status: 'approved' },
    attributes: [
      'product_id',
      [db.sequelize.fn('AVG', db.sequelize.col('rating')), 'avg'],
      [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count'],
    ],
    group: ['product_id'],
    raw: true,
  });
  for (const r of rows) {
    map.set(r.product_id, {
      rating: r.avg != null ? Math.round(Number(r.avg) * 100) / 100 : 0,
      count: Number(r.count) || 0,
    });
  }
  return map;
}

/**
 * Vendas reais por produto: itens de pedido cujo pedido está pago
 * (payment_status='paid'), somando quantity. Uma query agrupada (sem N+1).
 * Devolve Map product_id → total vendido.
 */
async function soldByProduct(productIds) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;
  const rows = await db.OrderItem.findAll({
    where: { product_id: { [Op.in]: ids } },
    attributes: [
      'product_id',
      [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('OrderItem.quantity')), 0), 'sold'],
    ],
    include: [{ model: db.Order, as: 'order', attributes: [], required: true, where: { payment_status: 'paid' } }],
    group: ['OrderItem.product_id'],
    raw: true,
  });
  for (const r of rows) map.set(r.product_id, Number(r.sold) || 0);
  return map;
}

/**
 * Agrega métricas de TODOS os produtos (ativos) de um conjunto de vendedores:
 * rating médio (reviews aprovadas), total de reviews, vendas reais e nº de
 * anúncios ativos. Duas queries agrupadas por seller (sem N+1).
 * Devolve Map seller_id → { rating, reviews_count, sales_count, products_count }.
 */
async function sellerStats(sellerIds) {
  const ids = [...new Set((sellerIds || []).filter(Boolean))];
  const map = new Map();
  if (!ids.length) return map;

  // Reviews aprovadas dos produtos do vendedor + contagem de anúncios ativos.
  const reviewRows = await db.Review.findAll({
    where: { status: 'approved' },
    attributes: [
      [db.sequelize.col('product.seller_id'), 'seller_id'],
      [db.sequelize.fn('AVG', db.sequelize.col('Review.rating')), 'avg'],
      [db.sequelize.fn('COUNT', db.sequelize.col('Review.id')), 'count'],
    ],
    include: [{ model: db.Product, as: 'product', attributes: [], required: true, where: { seller_id: { [Op.in]: ids } } }],
    group: [db.sequelize.col('product.seller_id')],
    raw: true,
  });

  // Vendas reais por vendedor (itens pagos) — join OrderItem→Order→Product.
  const salesRows = await db.OrderItem.findAll({
    attributes: [
      [db.sequelize.col('product.seller_id'), 'seller_id'],
      [db.sequelize.fn('COALESCE', db.sequelize.fn('SUM', db.sequelize.col('OrderItem.quantity')), 0), 'sales'],
    ],
    include: [
      { model: db.Order, as: 'order', attributes: [], required: true, where: { payment_status: 'paid' } },
      { model: db.Product, as: 'product', attributes: [], required: true, where: { seller_id: { [Op.in]: ids } } },
    ],
    group: [db.sequelize.col('product.seller_id')],
    raw: true,
  });

  // Anúncios ativos por vendedor.
  const productRows = await db.Product.findAll({
    where: { seller_id: { [Op.in]: ids }, status: 'active' },
    attributes: ['seller_id', [db.sequelize.fn('COUNT', db.sequelize.col('id')), 'count']],
    group: ['seller_id'],
    raw: true,
  });

  for (const id of ids) map.set(id, { rating: 0, reviews_count: 0, sales_count: 0, products_count: 0 });
  for (const r of reviewRows) {
    const cur = map.get(r.seller_id) || { rating: 0, reviews_count: 0, sales_count: 0, products_count: 0 };
    cur.rating = r.avg != null ? Math.round(Number(r.avg) * 100) / 100 : 0;
    cur.reviews_count = Number(r.count) || 0;
    map.set(r.seller_id, cur);
  }
  for (const r of salesRows) {
    const cur = map.get(r.seller_id) || { rating: 0, reviews_count: 0, sales_count: 0, products_count: 0 };
    cur.sales_count = Number(r.sales) || 0;
    map.set(r.seller_id, cur);
  }
  for (const r of productRows) {
    const cur = map.get(r.seller_id) || { rating: 0, reviews_count: 0, sales_count: 0, products_count: 0 };
    cur.products_count = Number(r.count) || 0;
    map.set(r.seller_id, cur);
  }
  return map;
}

/** Monta o objeto público de reputação do vendedor a partir do User + stats. */
function buildSellerReputation(seller, stats) {
  const s = stats || { rating: 0, reviews_count: 0, sales_count: 0, products_count: 0 };
  const rating = Number(s.rating) || 0;
  const salesCount = Number(s.sales_count) || 0;
  const isLeader = salesCount >= LEADER_MIN_SALES && rating >= LEADER_MIN_RATING;
  let reputationLabel = null;
  if (salesCount >= PLATINUM_MIN_SALES && rating >= PLATINUM_MIN_RATING) {
    reputationLabel = 'Vendedor Platinum';
  } else if (isLeader) {
    reputationLabel = 'Vendedor Líder';
  }
  // created_at (coluna underscored) só vem por getDataValue na instância Sequelize.
  const sellerCreatedAt = seller
    ? (typeof seller.getDataValue === 'function' ? seller.getDataValue('created_at') : seller.created_at)
    : null;
  // Flags individuais de verificação (para o front mostrar o que está validado).
  const emailVerified = !!(seller && seller.email_verified_at);
  const phoneVerified = !!(seller && seller.phone_verified_at);
  const documentVerified = !!(seller && seller.document_verified_at);
  const facialVerified = !!(seller && seller.seller_verification_status === 'verified');
  return {
    rating,
    reviews_count: Number(s.reviews_count) || 0,
    sales_count: salesCount,
    products_count: Number(s.products_count) || 0,
    seller_tier: seller && seller.seller_tier ? seller.seller_tier : 'standard',
    verification_level: computeVerificationLevel(seller),
    email_verified: emailVerified,
    phone_verified: phoneVerified,
    document_verified: documentVerified,
    facial_verified: facialVerified,
    is_leader: isLeader,
    reputation_label: reputationLabel,
    status: mapSellerStatus(seller && seller.account_status),
    chat_only: false, // sem fonte de restrição "somente chat" exposta aqui (is_shadowbanned não é embutido no produto)
    member_since: sellerCreatedAt ? new Date(sellerCreatedAt).getFullYear() : null,
  };
}

/**
 * Enriquecimento das linhas de produto: adiciona rating/reviews_count/sold em
 * cada produto e os campos de reputação no objeto `seller` embutido. Mutável
 * sobre as instâncias Sequelize (via setDataValue) para sair no JSON.
 */
async function enrichProducts(rows) {
  const list = Array.isArray(rows) ? rows : [rows];
  const products = list.filter(Boolean);
  if (!products.length) return rows;

  const productIds = products.map((p) => p.id);
  const sellerIds = products.map((p) => (p.seller ? p.seller.id : p.seller_id)).filter(Boolean);

  const [reviewMap, soldMap, sellerMap] = await Promise.all([
    reviewStatsByProduct(productIds),
    soldByProduct(productIds),
    sellerStats(sellerIds),
  ]);

  for (const p of products) {
    const rs = reviewMap.get(p.id) || { rating: 0, count: 0 };
    p.setDataValue('rating', rs.rating);
    p.setDataValue('reviews_count', rs.count);
    p.setDataValue('sold', soldMap.get(p.id) || 0);

    const seller = p.seller;
    if (seller) {
      const rep = buildSellerReputation(seller, sellerMap.get(seller.id));
      for (const [k, v] of Object.entries(rep)) seller.setDataValue(k, v);
    }
  }
  return rows;
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
  // Destaque SEMPRE no topo (Diamante > Ouro > Prata > Sem destaque), em QUALQUER
  // ordenação — busca e categorias. A ordenação escolhida (preço/recente/etc.)
  // ordena DENTRO de cada faixa de destaque.
  const highlightFirst = [
    db.sequelize.literal("CASE highlight_tier WHEN 'diamond' THEN 3 WHEN 'gold' THEN 2 WHEN 'silver' THEN 1 ELSE 0 END"),
    'DESC',
  ];
  // Vendedor Premium ganha visibilidade extra (paga 12% de comissão) — só na relevância.
  const premiumBoost = [
    db.sequelize.literal(`CASE WHEN "seller"."seller_tier" = 'premium' THEN 1 ELSE 0 END`),
    'DESC',
  ];
  switch (sort) {
    case 'recent':
      return [highlightFirst, ['created_at', 'DESC']];
    case 'price_asc':
      return [highlightFirst, [PRICE_EXPR(), 'ASC']];
    case 'price_desc':
      return [highlightFirst, [PRICE_EXPR(), 'DESC']];
    case 'best_selling':
      return [highlightFirst, ['favorites_count', 'DESC'], ['views_count', 'DESC'], ['created_at', 'DESC']];
    default: // relevância: destaques primeiro, vendedor Premium em seguida, depois recentes
      return [
        highlightFirst,
        premiumBoost,
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

  // Enriquecimento com dados REAIS (rating/reviews_count/sold + reputação do vendedor).
  await enrichProducts(rows);

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

/**
 * Listagem ADMIN de produtos: TODOS os status e vendedores, paginada, com
 * filtros opcionais (status, seller_id, category_id, q por título, highlight_tier).
 * Reaproveita a lógica de `list` (include do vendedor + categoria, enriquecimento),
 * mas sem forçar status='active'. Inclui status/highlight_tier/highlight_expires_at
 * e o objeto `seller` (id+name via enrichProducts) no retorno.
 */
async function adminList(params = {}) {
  const page = Math.max(1, Number(params.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  const offset = (page - 1) * limit;

  const where = {};
  const and = [];

  if (params.status) where.status = params.status; // sem default → qualquer status
  if (params.seller_id) where.seller_id = params.seller_id;
  if (params.category_id) where.category_id = params.category_id;
  if (params.highlight_tier) where.highlight_tier = params.highlight_tier;

  const term = (params.q != null ? params.q : params.search) || '';
  if (String(term).trim()) {
    and.push(db.sequelize.where(db.sequelize.literal(TITLE_UNACCENT), { [Op.iLike]: `%${unaccent(term)}%` }));
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

  await enrichProducts(rows);

  return { rows, total: count };
}

/* -------------------------------- specs_list ------------------------------ */

/** Prettifica uma chave (snake_case → "Snake Case") como fallback de label. */
function prettifyKey(key) {
  return String(key || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Formata um valor de especificação para exibição:
 * - array → junta com ", " (ignora itens vazios)
 * - booleano (ou strings "true"/"false") → "Sim"/"Não"
 * - demais → String. Anexa a unidade do field_definition quando houver.
 * Retorna null para valores vazios/sem conteúdo (para serem ignorados).
 */
function formatSpecValue(value, unit) {
  let out;
  if (Array.isArray(value)) {
    const parts = value.map((v) => String(v).trim()).filter(Boolean);
    if (!parts.length) return null;
    out = parts.join(', ');
  } else if (typeof value === 'boolean') {
    out = value ? 'Sim' : 'Não';
  } else if (value === 'true' || value === 'false') {
    out = value === 'true' ? 'Sim' : 'Não';
  } else {
    if (value == null) return null;
    out = String(value).trim();
    if (!out) return null;
  }
  if (unit) out = `${out} ${unit}`;
  return out;
}

/**
 * Ids da categoria do produto + ancestrais (categorias-pai), para herdar as
 * definições de campos. Sobe a árvore via parent_id em uma sequência curta de
 * leituras (a profundidade da árvore é pequena, com guarda anti-loop).
 */
async function categoryChainIds(categoryId) {
  const ids = [];
  let cid = categoryId;
  let guard = 0;
  while (cid && guard < 20) {
    ids.push(cid);
    const cat = await db.Category.findByPk(cid, { attributes: ['id', 'parent_id'], raw: true });
    if (!cat) break;
    cid = cat.parent_id;
    guard += 1;
  }
  return ids;
}

/**
 * Constrói `specs_list`: array [{ key, label, value }] a partir de
 * product.specifications (objeto { chave: valor }), buscando o label REAL de
 * cada chave nos field_definitions da categoria do produto e ancestrais. Uma
 * única query (field_definitions WHERE name IN chaves AND category_id IN cadeia).
 * - Ordena pelo sort_order do field_definition; chaves sem definição vão ao fim
 *   (ordem original do objeto), com label prettificado como fallback.
 * - Ignora valores vazios/null/array vazio.
 */
async function buildSpecsList(product) {
  const specs = product && product.specifications;
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return [];
  const keys = Object.keys(specs);
  if (!keys.length) return [];

  // Mapa chave → field_definition (uma query única, sem N+1).
  const defByName = new Map();
  const chainIds = await categoryChainIds(product.category_id);
  if (chainIds.length) {
    const defs = await db.FieldDefinition.findAll({
      where: { category_id: { [Op.in]: chainIds }, name: { [Op.in]: keys } },
      attributes: ['name', 'category_id', 'label', 'unit', 'sort_order'],
      raw: true,
    });
    // Se uma chave existir em mais de uma categoria da cadeia, a mais específica
    // (menor índice em chainIds) vence.
    const rank = new Map(chainIds.map((id, i) => [id, i]));
    for (const d of defs) {
      const prev = defByName.get(d.name);
      if (!prev || (rank.get(d.category_id) ?? 99) < (rank.get(prev.category_id) ?? 99)) {
        defByName.set(d.name, d);
      }
    }
  }

  const items = [];
  keys.forEach((key, index) => {
    const def = defByName.get(key) || null;
    const value = formatSpecValue(specs[key], def && def.unit);
    if (value == null) return; // ignora vazios
    items.push({
      key,
      label: def && def.label ? def.label : prettifyKey(key),
      value,
      _order: def && def.sort_order != null ? Number(def.sort_order) : null,
      _index: index,
    });
  });

  // Ordem estável: por sort_order do field_definition; sem definição vai ao fim
  // preservando a ordem original das chaves.
  items.sort((a, b) => {
    const ao = a._order == null ? Number.POSITIVE_INFINITY : a._order;
    const bo = b._order == null ? Number.POSITIVE_INFINITY : b._order;
    if (ao !== bo) return ao - bo;
    return a._index - b._index;
  });

  const list = items.map(({ key, label, value }) => ({ key, label, value }));

  // Especificações PERSONALIZADAS do vendedor (metadata.custom_specs): cada
  // { label, value } digitado livremente é anexado ao FIM da ficha técnica,
  // depois dos campos da categoria. Itens sem label/value são ignorados.
  const custom = product && product.metadata && product.metadata.custom_specs;
  if (Array.isArray(custom)) {
    let ci = 0;
    for (const spec of custom) {
      if (!spec || typeof spec !== 'object') continue;
      const label = String(spec.label == null ? '' : spec.label).trim();
      const value = String(spec.value == null ? '' : spec.value).trim();
      if (!label || !value) continue;
      list.push({ key: `custom_${ci}`, label, value, custom: true });
      ci += 1;
    }
  }

  return list;
}

/** Detalhe por id; incrementa views_count quando acesso público (`incrementViews`). */
async function getById(id, { incrementViews = false, viewerId = null } = {}) {
  const product = await db.Product.findByPk(id, {
    include: [sellerInclude(), { model: db.Category, as: 'category' }],
  });
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  // Visualização só conta para quem NÃO é o dono (o vendedor abrindo/pré-visualizando
  // o próprio anúncio não infla as visualizações).
  if (incrementViews && (!viewerId || String(viewerId) !== String(product.seller_id))) {
    await product.increment('views_count', { by: 1 });
    product.views_count = (product.views_count || 0) + 1;
  }
  // Enriquecimento com dados REAIS (rating/reviews_count/sold + reputação do vendedor).
  await enrichProducts(product);

  // specs_list: especificações rotuladas com os labels reais dos field_definitions
  // (mantém `specifications` cru para compatibilidade).
  product.setDataValue('specs_list', await buildSpecsList(product));
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
const PAID_STATUSES = ['approved', 'authorized'];

/** Primeiro nome do usuário (para o Customer do MP). */
function firstName(user) {
  return String(user.name || '').trim().split(/\s+/)[0] || undefined;
}

/**
 * Conta as vendas pagas de um produto (itens de pedido cujo pedido está pago).
 * Usado como snapshot/forma simples de "vendas" (não há sales_count no produto).
 */
async function _salesCount(productId) {
  try {
    return await db.OrderItem.count({
      where: { product_id: productId },
      include: [{ model: db.Order, as: 'order', required: true, where: { payment_status: 'paid' } }],
    });
  } catch (err) {
    logger.error('product.service: falha ao contar vendas para snapshot:', err.message);
    return null;
  }
}

/**
 * Garante que o produto NÃO tem destaque ativo vigente nem pendente.
 * Lança HIGHLIGHT_ALREADY_ACTIVE caso exista. (Chamado antes de criar um novo.)
 */
async function _assertNoActiveOrPending(productId) {
  const now = new Date();
  const blocking = await db.ProductHighlight.findOne({
    where: {
      product_id: productId,
      [Op.or]: [
        { status: 'pending' },
        { status: 'active', [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gt]: now } }] },
      ],
    },
  });
  if (blocking) {
    throw AppError.conflict(
      'Este anúncio já tem um destaque ativo ou aguardando pagamento.',
      'HIGHLIGHT_ALREADY_ACTIVE'
    );
  }
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

  // Bloqueia novo impulso se já há um destaque ATIVO vigente ou PENDENTE.
  await _assertNoActiveOrPending(productId);

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
      const mp = await mercadopago.createPixPayment({
        amount: pkg.price,
        description: `Destaque ${tier}`,
        payerEmail: user.email,
        externalReference: payment.id,
      });
      pix = pixFromMpPayment(mp) || null;
      // Persiste o id do MP e o Pix no payload (para o listHighlights/payHighlight).
      await payment.update(
        {
          external_id: mp && mp.id != null ? String(mp.id) : payment.external_id,
          payload: { ...(payment.payload || {}), ...mp, ...(pix ? { pix } : {}) },
        },
        { transaction }
      );
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
/** Status efetivo do highlight: 'active' com ends_at passado vira 'expired'. */
function effectiveStatus(h, now) {
  if (h.status === 'active' && h.ends_at && new Date(h.ends_at).getTime() <= now) {
    return 'expired';
  }
  return h.status;
}

/** Duração em dias do highlight (janela starts/ends, ou ends - created como fallback). */
function durationDaysOf(h) {
  const start = h.starts_at ? new Date(h.starts_at).getTime() : null;
  const end = h.ends_at ? new Date(h.ends_at).getTime() : null;
  if (start != null && end != null && end > start) {
    return Math.round((end - start) / (24 * 60 * 60 * 1000));
  }
  return null;
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

async function listHighlights(productId, user) {
  const product = await db.Product.findByPk(productId);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  const isAdmin = !!(user && (user.is_admin === true || user.admin_role));
  if (!isAdmin && (!user || product.seller_id !== user.id)) {
    throw AppError.forbidden('Você não é o dono deste anúncio.', 'NOT_PRODUCT_OWNER');
  }

  const rows = await db.ProductHighlight.findAll({
    where: { product_id: productId },
    include: [{ model: db.Payment, as: 'payment', attributes: ['id', 'status', 'method', 'payload'] }],
    order: [['created_at', 'DESC']],
  });

  const now = Date.now();

  // Vendas atuais (para os results) — calculadas uma vez se houver algum item com snapshot.
  const needsSales = rows.some((h) => h.sales_at_start != null);
  const currentSales = needsSales ? await _salesCount(productId) : null;
  const currentViews = Number(product.views_count || 0);
  const currentFavorites = Number(product.favorites_count || 0);

  const history = rows.map((h) => {
    const payment = h.payment || null;
    const status = effectiveStatus(h, now);
    const paid = !!(payment && PAID_STATUSES.includes(payment.status));

    // Pix só quando pendente e disponível.
    const pix = status === 'pending' ? pixFromPayment(payment) : null;

    // Resultados (ganho) só para active/expired com snapshot gravado.
    let results = null;
    if ((status === 'active' || status === 'expired') && h.views_at_start != null) {
      results = {
        views_gained: Math.max(0, currentViews - Number(h.views_at_start)),
        favorites_gained: Math.max(0, currentFavorites - Number(h.favorites_at_start || 0)),
        sales_gained:
          h.sales_at_start != null && currentSales != null
            ? Math.max(0, currentSales - Number(h.sales_at_start))
            : null,
      };
    }

    return {
      id: h.id,
      tier: h.tier,
      price: h.price != null ? Number(h.price) : null,
      currency: h.currency || 'BRL',
      status,
      created_at: h.created_at,
      starts_at: h.starts_at,
      ends_at: h.ends_at,
      duration_days: durationDaysOf(h),
      paid,
      payment: payment ? { id: payment.id, status: payment.status, method: payment.method } : null,
      pix,
      results,
    };
  });

  // has_active_or_pending: existe highlight 'active' (vigente) OU 'pending'.
  const has_active_or_pending = rows.some(
    (h) =>
      h.status === 'pending' ||
      (h.status === 'active' && (!h.ends_at || new Date(h.ends_at).getTime() > now))
  );

  // current: destaque ATIVO vigente — prioriza o estado consolidado no produto.
  let current = null;
  let activeRow = rows.find(
    (h) => h.status === 'active' && (!h.ends_at || new Date(h.ends_at).getTime() > now)
  );
  if (
    !activeRow &&
    product.highlight_tier &&
    product.highlight_tier !== 'none' &&
    (!product.highlight_expires_at || new Date(product.highlight_expires_at).getTime() > now)
  ) {
    // Sem linha ativa mas o produto está marcado como destacado.
    current = {
      id: null,
      tier: product.highlight_tier,
      status: 'active',
      starts_at: null,
      ends_at: product.highlight_expires_at,
      ...remainingTime(product.highlight_expires_at, now),
    };
  } else if (activeRow) {
    current = {
      id: activeRow.id,
      tier: activeRow.tier,
      status: 'active',
      starts_at: activeRow.starts_at,
      ends_at: activeRow.ends_at,
      ...remainingTime(activeRow.ends_at, now),
    };
  }

  return { current, has_active_or_pending, history };
}

/** Tempo restante até ends_at: { days_left, hours_left }. */
function remainingTime(endsAt, now) {
  if (!endsAt) return { days_left: null, hours_left: null };
  const ms = new Date(endsAt).getTime() - now;
  if (ms <= 0) return { days_left: 0, hours_left: 0 };
  return {
    days_left: Math.floor(ms / (24 * 60 * 60 * 1000)),
    hours_left: Math.floor(ms / (60 * 60 * 1000)),
  };
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

  // Snapshot das métricas atuais do produto (fora da transação; contagem de vendas
  // é só leitura/proxy e não deve abortar a ativação se falhar).
  const salesAtStart = await _salesCount(highlight.product_id);

  return db.sequelize.transaction(async (transaction) => {
    const product = await db.Product.findByPk(highlight.product_id, { transaction });

    await highlight.update(
      {
        status: 'active',
        starts_at: startsAt,
        ends_at: endsAt,
        views_at_start: product ? Number(product.views_count || 0) : null,
        favorites_at_start: product ? Number(product.favorites_count || 0) : null,
        sales_at_start: salesAtStart,
      },
      { transaction }
    );

    if (product) {
      await product.update(
        { highlight_tier: highlight.tier, highlight_expires_at: endsAt },
        { transaction }
      );
    }

    return highlight;
  });
}

/**
 * Concede/remove destaque por ADMIN (presentear/forçar boost), SEM pagamento.
 * - tier ∈ silver|gold|diamond: seta Product.highlight_tier e highlight_expires_at
 *   = now + days (default: duração do pacote, ou 7). Cria um ProductHighlight
 *   'active' (price 0, sem payment) para histórico.
 * - tier = none: remove o destaque (highlight_tier 'none', expires null) e cancela
 *   destaques ativos/pendentes vigentes do produto.
 * Retorna o produto atualizado.
 */
async function adminHighlight(productId, { tier, days } = {}) {
  const allowed = [...HIGHLIGHT_TIERS, 'none'];
  if (!tier || !allowed.includes(tier)) {
    throw AppError.unprocessable(
      `tier inválido. Valores: ${allowed.join(', ')}.`,
      'INVALID_HIGHLIGHT_TIER'
    );
  }

  const product = await db.Product.findByPk(productId);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  // Remover destaque.
  if (tier === 'none') {
    return db.sequelize.transaction(async (transaction) => {
      const now = new Date();
      await db.ProductHighlight.update(
        { status: 'cancelled', ends_at: now },
        {
          where: {
            product_id: productId,
            status: { [Op.in]: ['active', 'pending'] },
          },
          transaction,
        }
      );
      await product.update({ highlight_tier: 'none', highlight_expires_at: null }, { transaction });
      return product;
    });
  }

  // Conceder destaque (gift). Duração: days informado, ou duração do pacote, ou 7.
  let durationDays = days != null && days !== '' ? Number(days) : null;
  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    const pkg = await settings.highlight(tier).catch(() => null);
    durationDays = pkg && pkg.duration_days ? Number(pkg.duration_days) : 7;
  }

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const salesAtStart = await _salesCount(productId);

  return db.sequelize.transaction(async (transaction) => {
    // Cancela destaques ativos/pendentes anteriores (evita duplicidade no histórico).
    await db.ProductHighlight.update(
      { status: 'cancelled', ends_at: startsAt },
      {
        where: { product_id: productId, status: { [Op.in]: ['active', 'pending'] } },
        transaction,
      }
    );

    await db.ProductHighlight.create(
      {
        product_id: productId,
        user_id: product.seller_id,
        tier,
        price: 0,
        currency: 'BRL',
        status: 'active',
        payment_id: null,
        starts_at: startsAt,
        ends_at: endsAt,
        views_at_start: Number(product.views_count || 0),
        favorites_at_start: Number(product.favorites_count || 0),
        sales_at_start: salesAtStart,
      },
      { transaction }
    );

    await product.update(
      { highlight_tier: tier, highlight_expires_at: endsAt },
      { transaction }
    );

    return product;
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

/**
 * (Re)gera um Pix válido para um ProductHighlight PENDENTE do produto e o retorna.
 * - Se o Payment já tem um Pix persistido/consultável, reaproveita.
 * - Senão, consulta o MP por external_id (se houver) ou gera um novo Pix.
 * - Persiste o qr_code/qr_code_base64 em Payment.payload.pix.
 * Retorna { payment, pix: { qr_code, qr_code_base64 } }.
 */
async function payHighlight(productId, highlightId, user) {
  const product = await loadOwned(productId, user.id, {
    isAdmin: !!(user && (user.is_admin === true || user.admin_role)),
  });

  const highlight = await db.ProductHighlight.findOne({
    where: { id: highlightId, product_id: product.id },
    include: [{ model: db.Payment, as: 'payment' }],
  });
  if (!highlight) throw AppError.notFound('Destaque não encontrado.', 'HIGHLIGHT_NOT_FOUND');

  const payment = highlight.payment;
  if (!payment) throw AppError.notFound('Pagamento do destaque não encontrado.', 'PAYMENT_NOT_FOUND');

  // Já pago / já ativo → erro claro.
  if (PAID_STATUSES.includes(payment.status) || highlight.status === 'active') {
    throw AppError.conflict('Este destaque já está pago.', 'HIGHLIGHT_ALREADY_PAID');
  }
  if (highlight.status !== 'pending') {
    throw AppError.unprocessable(
      'Só é possível pagar um destaque pendente.',
      'HIGHLIGHT_NOT_PENDING'
    );
  }

  // 1) Pix já persistido no payload? Reaproveita.
  let pix = pixFromPayment(payment);

  // 2) Senão, tenta consultar o pagamento existente no MP (por external_id).
  if (!pix && payment.external_id) {
    try {
      const mp = await mercadopago.getPayment(payment.external_id);
      // Se o MP já marcou como aprovado, reflete e ativa.
      if (mp && APPROVED_STATUSES.has(mp.status)) {
        await payment.update({ status: 'approved', paid_at: new Date(), payload: mp });
        try {
          await activateHighlight(highlight.id);
        } catch (err) {
          logger.error('product.service.payHighlight: falha ao ativar após approved no MP:', err.message);
        }
        throw AppError.conflict('Este destaque já está pago.', 'HIGHLIGHT_ALREADY_PAID');
      }
      pix = pixFromMpPayment(mp);
      if (pix) {
        await payment.update({ payload: { ...(payment.payload || {}), ...mp, pix } });
      }
    } catch (err) {
      if (err instanceof AppError && err.code === 'HIGHLIGHT_ALREADY_PAID') throw err;
      logger.error('product.service.payHighlight: falha ao consultar pagamento no MP:', err.message);
    }
  }

  // 3) Ainda sem Pix → gera um novo no MP com o mesmo valor/descrição.
  if (!pix) {
    const dbUser = await db.User.findByPk(payment.user_id);
    let mp = null;
    try {
      mp = await mercadopago.createPixPayment({
        amount: Number(payment.amount),
        description: `Destaque ${highlight.tier}`,
        payerEmail: dbUser ? dbUser.email : undefined,
        externalReference: payment.id,
      });
    } catch (err) {
      if (err && err.statusCode === 503) {
        throw AppError.conflict(
          'Gateway de pagamento não configurado.',
          'GATEWAY_NOT_CONFIGURED'
        );
      }
      throw err;
    }
    pix = pixFromMpPayment(mp);
    await payment.update({
      external_id: mp && mp.id != null ? String(mp.id) : payment.external_id,
      payload: { ...(payment.payload || {}), ...mp, ...(pix ? { pix } : {}) },
    });
  }

  return { payment, pix: pix || null };
}

/**
 * Perfil público de reputação de um vendedor (fonte única para o selo de confiança).
 * Carrega o User por id e reaproveita sellerStats (agregados reais, sem N+1) +
 * buildSellerReputation/computeVerificationLevel para montar a saída.
 */
async function getSellerProfile(userId) {
  const seller = await db.User.findByPk(userId, {
    attributes: [
      'id',
      'name',
      'avatar_url',
      'seller_tier',
      'account_status',
      'email_verified_at',
      'phone_verified_at',
      'document_verified_at',
      'seller_verification_status',
      'created_at',
    ],
  });
  if (!seller) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');

  // Agregados reais (rating médio de reviews aprovadas, vendas pagas, anúncios ativos).
  const statsMap = await sellerStats([seller.id]);
  const rep = buildSellerReputation(seller, statsMap.get(seller.id));

  return {
    id: seller.id,
    name: seller.name,
    avatar_url: seller.avatar_url || null,
    member_since: rep.member_since,
    rating: rep.rating,
    reviews_count: rep.reviews_count,
    sales_count: rep.sales_count,
    products_count: rep.products_count,
    seller_tier: rep.seller_tier,
    verification_level: rep.verification_level,
    reputation_label: rep.reputation_label,
    status: rep.status,
    email_verified: rep.email_verified,
    phone_verified: rep.phone_verified,
    document_verified: rep.document_verified,
    facial_verified: rep.facial_verified,
  };
}

/* -------------------------------- bulk admin ----------------------------- */

const BULK_MAX = 200;

/**
 * Aplica `fn(id)` para cada id, isolando erros por item (try/catch).
 * Não para no primeiro erro: acumula sucessos e falhas.
 * Retorna { ok: <nº de sucessos>, failed: [{ id, error }] }.
 */
async function bulkApply(ids, fn) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw AppError.unprocessable('ids deve ser um array não vazio.', 'BULK_IDS_REQUIRED');
  }
  if (ids.length > BULK_MAX) {
    throw AppError.unprocessable(`Máximo de ${BULK_MAX} itens por lote.`, 'BULK_TOO_MANY');
  }
  let ok = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await fn(id);
      ok += 1;
    } catch (err) {
      failed.push({ id, error: err && err.message ? err.message : String(err) });
    }
  }
  return { ok, failed };
}

/**
 * Ações em massa de produtos (admin). Reaproveita os services existentes,
 * isolando erros por id. action ∈ activate|deactivate|delete|boost.
 */
async function bulkAdmin({ ids, action, payload } = {}) {
  const handlers = {
    activate: (id) => setStatus(id, 'active'),
    deactivate: (id) => setStatus(id, 'paused'),
    delete: (id) => remove(id, null, { isAdmin: true }),
    boost: (id) => adminHighlight(id, payload || {}),
  };
  const fn = handlers[action];
  if (!fn) {
    throw AppError.unprocessable(
      `action inválida. Valores: ${Object.keys(handlers).join(', ')}.`,
      'INVALID_BULK_ACTION'
    );
  }
  return bulkApply(ids, fn);
}

module.exports = {
  slugify,
  TIER_RANK,
  list,
  adminList,
  adminHighlight,
  bulkAdmin,
  bulkApply,
  getById,
  getSellerProfile,
  create,
  update,
  publish,
  setStatus,
  remove,
  purchaseHighlight,
  payHighlight,
  activateHighlight,
  listHighlightPackages,
  listHighlights,
};
