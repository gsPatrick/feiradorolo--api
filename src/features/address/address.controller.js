'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./address.service');

const list = catchAsync(async (req, res) => sendOk(res, await service.listMine(req.user.id)));
const create = catchAsync(async (req, res) => sendCreated(res, await service.create(req.user.id, req.body), 'Endereço salvo.'));
const update = catchAsync(async (req, res) => sendOk(res, await service.update(req.user.id, req.params.id, req.body), 'Endereço atualizado.'));
const setDefault = catchAsync(async (req, res) => sendOk(res, await service.setDefault(req.user.id, req.params.id), 'Endereço padrão definido.'));
const remove = catchAsync(async (req, res) => {
  await service.remove(req.user.id, req.params.id);
  return sendNoContent(res);
});

module.exports = { list, create, update, setDefault, remove };
