'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./favorite.service');

const listMine = catchAsync(async (req, res) => sendOk(res, await service.listMine(req.user.id)));
const idsMine = catchAsync(async (req, res) => sendOk(res, await service.idsMine(req.user.id)));
const add = catchAsync(async (req, res) => sendCreated(res, await service.add(req.user.id, req.params.productId), 'Adicionado aos favoritos.'));
const remove = catchAsync(async (req, res) => {
  await service.remove(req.user.id, req.params.productId);
  return sendNoContent(res);
});

module.exports = { listMine, idsMine, add, remove };
