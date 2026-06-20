'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const service = require('./question.service');

const list = catchAsync(async (req, res) => {
  if (!req.query.product_id) throw AppError.badRequest('product_id é obrigatório.', 'PRODUCT_ID_REQUIRED');
  return sendOk(res, await service.listByProduct(req.query.product_id));
});

const ask = catchAsync(async (req, res) =>
  sendCreated(res, await service.ask(req.user.id, req.body.product_id, req.body.question), 'Pergunta enviada.')
);

const answer = catchAsync(async (req, res) =>
  sendOk(res, await service.answer(req.params.id, req.user.id, req.body.answer), 'Resposta publicada.')
);

module.exports = { list, ask, answer };
