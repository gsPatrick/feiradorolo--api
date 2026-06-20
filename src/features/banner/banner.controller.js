'use strict';

/** Controller de Banners. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./banner.service');

const listPublic = catchAsync(async (req, res) => {
  const data = await service.listPublic({ position: req.query.position });
  return sendOk(res, data);
});

const listAll = catchAsync(async (req, res) => sendOk(res, await service.listAll()));

const getById = catchAsync(async (req, res) => sendOk(res, await service.getById(req.params.id)));

const create = catchAsync(async (req, res) => {
  const data = await service.create(req.body, req.user && req.user.id);
  return sendCreated(res, data, 'Banner criado.');
});

const update = catchAsync(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  return sendOk(res, data, 'Banner atualizado.');
});

const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.id);
  return sendNoContent(res);
});

module.exports = { listPublic, listAll, getById, create, update, remove };
