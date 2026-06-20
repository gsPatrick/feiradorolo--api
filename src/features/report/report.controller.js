'use strict';

/** Controller de Denúncias (/api/v1/reports). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const service = require('./report.service');

const create = catchAsync(async (req, res) => {
  const report = await service.create(req.user.id, req.body);
  return sendCreated(res, report, 'Denúncia registrada. Obrigado por ajudar a manter a plataforma segura.');
});

const adminList = catchAsync(async (req, res) => {
  const { rows, total } = await service.adminList(req.query);
  return paginated(res, rows, { page: req.query.page || 1, limit: req.query.limit || 50, total });
});

const adminResolve = catchAsync(async (req, res) => {
  const report = await service.adminResolve(req.params.id, req.body, req.user.id);
  return sendOk(res, report, 'Denúncia atualizada.');
});

module.exports = { create, adminList, adminResolve };
