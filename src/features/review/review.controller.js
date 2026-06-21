'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const AppError = require('../../utils/AppError');
const service = require('./review.service');

const list = catchAsync(async (req, res) => {
  if (!req.query.product_id) throw AppError.badRequest('product_id é obrigatório.', 'PRODUCT_ID_REQUIRED');
  return sendOk(res, await service.listByProduct(req.query.product_id));
});

const listMine = catchAsync(async (req, res) => sendOk(res, await service.listMine(req.user.id)));

const create = catchAsync(async (req, res) => sendCreated(res, await service.create(req.user.id, req.body), 'Avaliação enviada.'));

const canReview = catchAsync(async (req, res) =>
  sendOk(res, { canReview: await service.canReview(req.user.id, req.query.product_id) })
);

module.exports = { list, listMine, create, canReview };
