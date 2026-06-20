'use strict';

/** Controller de Notificações (/api/v1/notifications). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const service = require('./notification.service');

const registerDevice = catchAsync(async (req, res) => {
  const device = await service.registerDevice(req.user.id, req.body);
  return sendCreated(res, { id: device.id, platform: device.platform, provider: device.provider }, 'Dispositivo registrado.');
});

const removeDevice = catchAsync(async (req, res) => {
  const result = await service.removeDevice(req.user.id, req.body.token);
  return sendOk(res, result, 'Dispositivo removido.');
});

const list = catchAsync(async (req, res) => {
  const { rows, total } = await service.listForUser(req.user.id, req.query);
  return paginated(res, rows, { page: req.query.page || 1, limit: req.query.limit || 20, total });
});

const markRead = catchAsync(async (req, res) => {
  const n = await service.markRead(req.params.id, req.user.id);
  return sendOk(res, n, 'Notificação marcada como lida.');
});

const markAllRead = catchAsync(async (req, res) => {
  const result = await service.markAllRead(req.user.id);
  return sendOk(res, result);
});

const sendTest = catchAsync(async (req, res) => {
  const targetId = req.body.user_id || req.user.id;
  const n = await service.sendTest(targetId);
  return sendOk(res, n, 'Push de teste disparado.');
});

const adminList = catchAsync(async (req, res) => {
  const { rows, total } = await service.adminList(req.query);
  return paginated(res, rows, { page: req.query.page || 1, limit: req.query.limit || 30, total });
});

const adminCreate = catchAsync(async (req, res) => {
  const n = await service.adminCreate(req.body);
  return sendCreated(res, n, 'Notificação enviada.');
});

const adminDelete = catchAsync(async (req, res) => {
  await service.adminDelete(req.params.id);
  return sendOk(res, null, 'Notificação removida.');
});

const adminClearAll = catchAsync(async (req, res) => {
  const removed = await service.adminClearAll();
  return sendOk(res, { removed }, 'Histórico limpo.');
});

module.exports = { registerDevice, removeDevice, list, markRead, markAllRead, sendTest, adminList, adminCreate, adminDelete, adminClearAll };
