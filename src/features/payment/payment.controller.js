'use strict';

/** Controller de Pagamentos (/api/v1/payments). */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const paymentService = require('./payment.service');
const accountService = require('./payment-account.service');
const settings = require('../../services/settings.cache');

const createPreference = catchAsync(async (req, res) => {
  const result = await paymentService.createCheckoutPreference(req.params.orderId, req.user);
  return sendCreated(res, result, 'Preferência de pagamento criada.');
});

const createPayment = catchAsync(async (req, res) => {
  const result = await paymentService.createOrderPayment(req.params.orderId, req.user, req.body);
  return sendCreated(res, result, 'Pagamento processado.');
});

/** Webhook do gateway — SEMPRE responde 200 para evitar reentrega. */
const webhook = catchAsync(async (req, res) => {
  const result = await paymentService.handleWebhook(req.body, req.query, req.headers);
  return res.status(200).json({ received: true, ...result });
});

const getById = catchAsync(async (req, res) => {
  const payment = await paymentService.getById(req.params.id, req.user);
  return sendOk(res, payment);
});

/* ---- Onboarding do repasse (OAuth Mercado Pago) ---- */

const connect = catchAsync(async (req, res) => {
  const result = await accountService.getAuthorizationUrl(req.user.id);
  return sendOk(res, result, 'Autorize o vínculo da sua conta de recebimento.');
});

/** Callback do OAuth (o Mercado Pago redireciona o vendedor para cá). */
const connectCallback = catchAsync(async (req, res) => {
  const account = await accountService.handleCallback({ code: req.query.code, state: req.query.state });
  const web = await settings.get('app.web_url', '');
  if (web) return res.redirect(`${web}/seller/payments?linked=1`);
  return sendOk(res, account, 'Conta de recebimento vinculada com sucesso.');
});

const connectStatus = catchAsync(async (req, res) => {
  const status = await accountService.getStatus(req.user.id);
  return sendOk(res, status);
});

const disconnect = catchAsync(async (req, res) => {
  const result = await accountService.unlink(req.user.id);
  return sendOk(res, result, 'Conta de recebimento desvinculada.');
});

module.exports = {
  createPreference,
  createPayment,
  webhook,
  getById,
  connect,
  connectCallback,
  connectStatus,
  disconnect,
};
