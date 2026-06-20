'use strict';

/** Controller de Envios (/api/v1/shipments). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const shipmentService = require('./shipment.service');

const quote = catchAsync(async (req, res) => {
  const options = await shipmentService.quote(req.body);
  return sendOk(res, options);
});

const createForOrder = catchAsync(async (req, res) => {
  const shipment = await shipmentService.createForOrder(req.params.orderId, req.body, req.user);
  return sendCreated(res, shipment, 'Envio criado.');
});

const generateLabel = catchAsync(async (req, res) => {
  const shipment = await shipmentService.generateLabel(req.params.id);
  return sendOk(res, shipment, 'Etiqueta gerada.');
});

const track = catchAsync(async (req, res) => {
  const result = await shipmentService.track(req.params.id);
  return sendOk(res, result);
});

module.exports = { quote, createForOrder, generateLabel, track };
