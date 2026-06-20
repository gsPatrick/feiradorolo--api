'use strict';

/** Controller de páginas de conteúdo. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./content.service');

const listPublic = catchAsync(async (req, res) => sendOk(res, await service.listPublic()));
const getBySlug = catchAsync(async (req, res) => sendOk(res, await service.getBySlug(req.params.slug)));

const listAll = catchAsync(async (req, res) => sendOk(res, await service.listAll()));
const upsert = catchAsync(async (req, res) => {
  const data = await service.upsert(req.params.slug, req.body, req.user && req.user.id);
  return sendCreated(res, data, 'Página salva.');
});
const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.slug);
  return sendNoContent(res);
});

module.exports = { listPublic, getBySlug, listAll, upsert, remove };
