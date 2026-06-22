'use strict';

const catchAsync = require('../../utils/catchAsync');
const { sendOk } = require('../../utils/apiResponse');
const service = require('./analytics.service');

const overview = catchAsync(async (req, res) => sendOk(res, await service.overview({ period: req.query.period })));
const systemHealth = catchAsync(async (req, res) => sendOk(res, await service.systemHealth()));
const dashboard = catchAsync(async (req, res) => sendOk(res, await service.dashboard()));
const traffic = catchAsync(async (req, res) => sendOk(res, await service.traffic()));

module.exports = { overview, systemHealth, dashboard, traffic };
