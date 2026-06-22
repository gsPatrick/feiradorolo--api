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

/** Histórico de pagamentos do usuário logado: { data, summary, pagination }. */
const listMine = catchAsync(async (req, res) => {
  const result = await paymentService.listMine(req.user, {
    page: req.query.page,
    limit: req.query.limit,
    status: req.query.status,
    group: req.query.group,
  });
  return sendOk(res, result);
});

/** Resumo agregado (total gasto + contagens) dos pagamentos do usuário. */
const myselfSummary = catchAsync(async (req, res) => {
  const summary = await paymentService.summaryMine(req.user);
  return sendOk(res, summary);
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

// Public Key do gateway ativo — usada pelo SDK MercadoPago.js no Checkout
// Transparente (tokenização de cartão). Não é segredo.
const publicKey = catchAsync(async (req, res) => {
  const gw = await settings.activeGateway('mercado_pago');
  return sendOk(res, {
    public_key: (gw && gw.publicKey) || null,
    environment: (gw && gw.environment) || null,
  });
});

module.exports = {
  createPreference,
  createPayment,
  webhook,
  getById,
  listMine,
  myselfSummary,
  connect,
  connectCallback,
  connectStatus,
  disconnect,
  publicKey,
};
