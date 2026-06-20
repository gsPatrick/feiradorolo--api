'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./email-template.service');

const list = catchAsync(async (req, res) => sendOk(res, await service.list()));
const create = catchAsync(async (req, res) => sendCreated(res, await service.create(req.body, req.user.id), 'Template criado.'));
const update = catchAsync(async (req, res) => sendOk(res, await service.update(req.params.id, req.body, req.user.id), 'Template atualizado.'));
const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.id);
  return sendNoContent(res);
});

module.exports = { list, create, update, remove };
