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

/**
 * Compra/assinatura de um plano. Sem `card` no body → gera Pix dinâmico. Com
 * `card` ({ token, payment_method_id, save_card }) → débito no cartão (checkout
 * transparente), opcionalmente salvando o cartão para renovação automática.
 */
const subscribe = catchAsync(async (req, res) => {
  const card = req.body && req.body.card;
  const result = await planService.subscribe(req.params.planId, req.user.id, { card });
  const message =
    result.method === 'credit_card'
      ? result.approved
        ? 'Plano contratado e ativado com sucesso.'
        : result.note || 'Não foi possível aprovar o pagamento no cartão.'
      : 'Assinatura criada. Conclua o pagamento via Pix.';
  return sendCreated(res, result, message);
});

/* Admin */
const adminList = catchAsync(async (req, res) => {
  return sendOk(res, await planService.adminList());
});
const adminCreate = catchAsync(async (req, res) => {
  return sendCreated(res, await planService.adminCreate(req.body), 'Plano criado.');
});
const adminUpdate = catchAsync(async (req, res) => {
  return sendOk(res, await planService.adminUpdate(req.params.id, req.body), 'Plano atualizado.');
});
const adminRemove = catchAsync(async (req, res) => {
  await planService.adminRemove(req.params.id);
  return sendOk(res, null, 'Plano removido.');
});

module.exports = {
  list,
  mine,
  subscribe,
  adminList,
  adminCreate,
  adminUpdate,
  adminRemove,
};
