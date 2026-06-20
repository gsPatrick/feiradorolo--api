'use strict';

/** Controller de Escrow (/api/v1/escrow). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, paginated } = require('../../utils/apiResponse');
const escrowService = require('./escrow.service');

const getByOrder = catchAsync(async (req, res) => {
  const escrow = await escrowService.getByOrder(req.params.orderId, req.user.id);
  return sendOk(res, escrow);
});

const releaseManual = catchAsync(async (req, res) => {
  const escrow = await escrowService.releaseManual(req.params.orderId, req.user.id);
  return sendOk(res, escrow, 'Recebimento confirmado e custódia liberada.');
});

const releaseByToken = catchAsync(async (req, res) => {
  const escrow = await escrowService.releaseByToken(req.params.orderId, req.user.id, req.body.token);
  return sendOk(res, escrow, 'Retirada confirmada e custódia liberada.');
});

const listPending = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { rows, total } = await escrowService.listHeld({ page, limit });
  return paginated(res, rows, { page, limit, total });
});

module.exports = { getByOrder, releaseManual, releaseByToken, listPending };
