'use strict';

/** Controller de Planos (/api/v1/plans). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const planService = require('./plan.service');

/** Catálogo de planos ativos. */
const list = catchAsync(async (req, res) => {
  const plans = await planService.listActive();
  return sendOk(res, plans);
});

/** Assinaturas do usuário logado. */
const mine = catchAsync(async (req, res) => {
  const subscriptions = await planService.listMine(req.user.id);
  return sendOk(res, subscriptions);
});

/** Compra/assinatura de um plano (gera Pix dinâmico via Mercado Pago). */
const subscribe = catchAsync(async (req, res) => {
  const result = await planService.subscribe(req.params.planId, req.user.id);
  return sendCreated(res, result, 'Assinatura criada. Conclua o pagamento via Pix.');
});

module.exports = {
  list,
  mine,
  subscribe,
};
