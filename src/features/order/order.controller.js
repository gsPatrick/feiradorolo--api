'use strict';

/** Controller de Pedidos (/api/v1/orders). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const orderService = require('./order.service');

const checkout = catchAsync(async (req, res) => {
  const orders = await orderService.checkout(req.user.id, req.body);
  return sendCreated(res, orders, 'Pedido(s) criado(s). Prossiga para o pagamento.');
});

const list = catchAsync(async (req, res) => {
  const { role = 'buyer', page = 1, limit = 20, status } = req.query;
  const { rows, total } = await orderService.listForUser(req.user.id, { role, page, limit, status });
  return paginated(res, rows, { page, limit, total });
});

const getById = catchAsync(async (req, res) => {
  const order = await orderService.getById(req.params.id, req.user);
  return sendOk(res, order);
});

const cancel = catchAsync(async (req, res) => {
  const order = await orderService.cancel(req.params.id, req.user);
  return sendOk(res, order, 'Pedido cancelado.');
});

const openDispute = catchAsync(async (req, res) => {
  const dispute = await orderService.openDispute(req.params.id, req.user.id, req.body);
  return sendCreated(res, dispute, 'Disputa aberta.');
});

const resolveDispute = catchAsync(async (req, res) => {
  const dispute = await orderService.resolveDispute(req.params.id, req.user.id, req.body);
  return sendOk(res, dispute, 'Disputa resolvida.');
});

const listAll = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const { rows, total } = await orderService.listAll({ page, limit, status });
  return paginated(res, rows, { page, limit, total });
});

module.exports = { checkout, list, getById, cancel, openDispute, resolveDispute, listAll };
