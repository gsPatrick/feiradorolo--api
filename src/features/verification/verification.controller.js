'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk } = require('../../utils/apiResponse');
const service = require('./verification.service');

const requestEmail = catchAsync(async (req, res) => sendOk(res, await service.requestEmail(req.user)));

const confirmEmail = catchAsync(async (req, res) =>
  sendOk(res, await service.confirmEmail(req.user, req.body && req.body.code))
);

const requestPhone = catchAsync(async (req, res) => sendOk(res, await service.requestPhone(req.user)));

const confirmPhone = catchAsync(async (req, res) =>
  sendOk(res, await service.confirmPhone(req.user, req.body && req.body.code))
);

const status = catchAsync(async (req, res) => sendOk(res, await service.status(req.user)));

module.exports = { requestEmail, confirmEmail, requestPhone, confirmPhone, status };
