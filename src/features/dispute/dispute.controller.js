'use strict';

/** Controller de Devolução/Disputa (/api/v1/disputes). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const disputeService = require('./dispute.service');

const requestReturn = catchAsync(async (req, res) => {
  const { order_id, reason, description, product_state, evidence } = req.body;
  const dispute = await disputeService.requestReturn(order_id, req.user, {
    reason,
    description,
    product_state,
    evidence,
  });
  return sendCreated(res, dispute, 'Solicitação de devolução registrada.');
});

const listMine = catchAsync(async (req, res) => {
  const disputes = await disputeService.listMine(req.user);
  return sendOk(res, disputes);
});

const getById = catchAsync(async (req, res) => {
  const dispute = await disputeService.getById(req.params.id, req.user);
  return sendOk(res, dispute);
});

const approveReturn = catchAsync(async (req, res) => {
  const dispute = await disputeService.approveReturn(req.params.id, req.user);
  return sendOk(res, dispute, 'Devolução aprovada e reembolso processado.');
});

const rejectReturn = catchAsync(async (req, res) => {
  const dispute = await disputeService.rejectReturn(req.params.id, req.user, { notes: req.body.notes });
  return sendOk(res, dispute, 'Devolução contestada. O caso será mediado.');
});

const listAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 30, status } = req.query;
  const { rows, total } = await disputeService.listAdmin({ page, limit, status });
  return paginated(res, rows, { page, limit, total });
});

const resolve = catchAsync(async (req, res) => {
  const { resolution, amount, notes } = req.body;
  const dispute = await disputeService.resolve(req.params.id, req.user, { resolution, amount, notes });
  return sendOk(res, dispute, 'Disputa resolvida.');
});

module.exports = { requestReturn, listMine, getById, approveReturn, rejectReturn, listAdmin, resolve };
