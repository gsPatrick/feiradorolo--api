'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./coupon.service');

const listActive = catchAsync(async (req, res) => sendOk(res, await service.listActive()));

const validate = catchAsync(async (req, res) => {
  const { code, subtotal } = req.body;
  const result = await service.validate(req.user && req.user.id, code, subtotal);
  return sendOk(res, { code: result.coupon.code, discount: result.discount, type: result.coupon.type, value: Number(result.coupon.value) }, 'Cupom válido.');
});

const listAll = catchAsync(async (req, res) => sendOk(res, await service.listAll()));
const create = catchAsync(async (req, res) => sendCreated(res, await service.create(req.body, req.user.id), 'Cupom criado.'));
const update = catchAsync(async (req, res) => sendOk(res, await service.update(req.params.id, req.body), 'Cupom atualizado.'));
const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.id);
  return sendNoContent(res);
});

module.exports = { listActive, validate, listAll, create, update, remove };
