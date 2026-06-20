'use strict';

/** Controller de configuração pública. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk } = require('../../utils/apiResponse');
const service = require('./config.service');

const publicSettings = catchAsync(async (req, res) => {
  const data = await service.getPublicSettings();
  return sendOk(res, data);
});

const fees = catchAsync(async (req, res) => {
  const data = await service.getFees();
  return sendOk(res, data);
});

module.exports = { publicSettings, fees };
