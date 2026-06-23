'use strict';

/** Controller de Produtos (anúncios) e upsell de Destaque. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent, paginated } = require('../../utils/apiResponse');
const service = require('./product.service');

function isAdmin(req) {
  return !!(req.user && (req.user.is_admin === true || req.user.admin_role));
}

const list = catchAsync(async (req, res) => {
  const params = {
    page: req.query.page,
    limit: req.query.limit,
    category_id: req.query.category_id,
    slug: req.query.slug,
    category_slug: req.query.category_slug,
    seller_id: req.query.seller_id,
    status: req.query.status,
    q: req.query.q,
    search: req.query.search,
    highlight_tier: req.query.highlight_tier,
    sort: req.query.sort,
    price_min: req.query.price_min,
    price_max: req.query.price_max,
    condition: req.query.condition,
    state: req.query.state,
    lat: req.query.lat,
    lng: req.query.lng,
    radius: req.query.radius,
    facets: req.query.facets === '1' || req.query.facets === 'true',
  };

  // Filtros por especificação (JSONB): qualquer query param `spec_<chave>` é
  // repassado intacto ao serviço (ex.: spec_largura, spec_aro, spec_marca).
  for (const [k, v] of Object.entries(req.query)) {
    if (k.startsWith('spec_') && v != null && v !== '') params[k] = v;
  }

  // Listagem pública: força apenas anúncios ativos a menos que seja admin.
  if (params.status && !isAdmin(req)) {
    params.status = undefined;
  }

  const { rows, total, facets } = await service.list(params);
  const page = Number(params.page) || 1;
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));

  // Com ?facets=1 devolve um objeto rico (para a página de busca/filtros);
  // sem facetas mantém o formato paginado (array) para os demais consumidores.
  if (params.facets) {
    return sendOk(res, { products: rows, total, page, limit, facets });
  }
  return paginated(res, rows, { page, limit, total });
});

// Autocomplete de busca (público, leve) → [{ term }].
const suggestions = catchAsync(async (req, res) => {
  const data = await service.suggestions(req.query.q);
  return sendOk(res, data);
});

// Listagem ADMIN: todos os status/vendedores, com filtros via query.
const adminList = catchAsync(async (req, res) => {
  const params = {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    seller_id: req.query.seller_id,
    category_id: req.query.category_id,
    q: req.query.q,
    search: req.query.search,
    highlight_tier: req.query.highlight_tier,
    sort: req.query.sort,
  };
  const { rows, total } = await service.adminList(params);
  const page = Number(params.page) || 1;
  const limit = Math.min(100, Math.max(1, Number(params.limit) || 20));
  return paginated(res, rows, { page, limit, total });
});

const getById = catchAsync(async (req, res) => {
  // Acesso público incrementa views_count (exceto o próprio dono).
  const data = await service.getById(req.params.id, { incrementViews: true, viewerId: req.user && req.user.id });
  return sendOk(res, data);
});

const create = catchAsync(async (req, res) => {
  const data = await service.create(req.user.id, req.body);
  return sendCreated(res, data, 'Anúncio criado com sucesso.');
});

const update = catchAsync(async (req, res) => {
  const data = await service.update(req.params.id, req.user.id, req.body, { isAdmin: isAdmin(req) });
  return sendOk(res, data, 'Anúncio atualizado com sucesso.');
});

const publish = catchAsync(async (req, res) => {
  const data = await service.publish(req.params.id, req.user.id, { isAdmin: isAdmin(req) });
  return sendOk(res, data, 'Anúncio publicado com sucesso.');
});

const setStatus = catchAsync(async (req, res) => {
  const data = await service.setStatus(req.params.id, req.body.status);
  return sendOk(res, data, 'Status do anúncio atualizado.');
});

const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.id, req.user.id, { isAdmin: isAdmin(req) });
  return sendNoContent(res);
});

const purchaseHighlight = catchAsync(async (req, res) => {
  const data = await service.purchaseHighlight(req.params.id, req.user.id, {
    tier: req.body.tier,
    card: req.body.card,
  });
  return sendCreated(res, data, 'Compra de destaque iniciada.');
});

// (Re)gera o Pix de um destaque pendente do produto (dono).
const payHighlight = catchAsync(async (req, res) => {
  const data = await service.payHighlight(req.params.id, req.params.highlightId, req.user);
  return sendOk(res, data, 'Pix do destaque gerado.');
});

// Concede/remove destaque por ADMIN (gift, sem pagamento).
const adminHighlight = catchAsync(async (req, res) => {
  const data = await service.adminHighlight(req.params.id, {
    tier: req.body.tier,
    days: req.body.days,
  });
  return sendOk(res, data, 'Destaque atualizado pelo administrador.');
});

// Ações em massa (admin): activate|deactivate|delete|boost para vários ids.
const bulkAdmin = catchAsync(async (req, res) => {
  const result = await service.bulkAdmin({
    ids: req.body.ids,
    action: req.body.action,
    payload: req.body.payload,
  });
  return sendOk(res, result, 'Ação em massa processada.');
});

// Catálogo público dos pacotes de destaque (preços/vigência reais).
const highlightPackages = catchAsync(async (req, res) => {
  const data = await service.listHighlightPackages();
  return sendOk(res, data);
});

// Histórico/status de destaque do produto (dono ou admin).
const listHighlights = catchAsync(async (req, res) => {
  const data = await service.listHighlights(req.params.id, req.user);
  return sendOk(res, data);
});

module.exports = {
  list,
  suggestions,
  adminList,
  adminHighlight,
  getById,
  create,
  update,
  publish,
  setStatus,
  remove,
  bulkAdmin,
  purchaseHighlight,
  payHighlight,
  highlightPackages,
  listHighlights,
};
