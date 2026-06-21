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

const getById = catchAsync(async (req, res) => {
  // Acesso público incrementa views_count.
  const data = await service.getById(req.params.id, { incrementViews: true });
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
  const data = await service.purchaseHighlight(req.params.id, req.user.id, { tier: req.body.tier });
  return sendCreated(res, data, 'Compra de destaque iniciada.');
});

module.exports = {
  list,
  getById,
  create,
  update,
  publish,
  setStatus,
  remove,
  purchaseHighlight,
};
