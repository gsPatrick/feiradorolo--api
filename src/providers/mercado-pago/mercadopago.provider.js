'use strict';

/**
 * Provider do Mercado Pago — integração com SPLIT/repasse nativo (marketplace).
 *
 * Credenciais da APLICAÇÃO (client_id/secret/access_token da plataforma) vêm de
 * payment_gateway_settings. O vínculo de cada VENDEDOR é feito por OAuth e o
 * pagamento é criado com o access_token DO VENDEDOR + `marketplace_fee`
 * (Checkout Pro) ou `application_fee` (Checkout API): o Mercado Pago desconta a
 * taxa dele, depois a comissão do marketplace, e repassa o líquido direto à
 * conta do vendedor. "Segurar o dinheiro" é configurável (capture/liberação).
 *
 * Tudo que o MP aceita pode ser injetado via `advancedOptions` (passthrough),
 * mantendo 100% configurável pelo admin sem hardcode.
 */
const axios = require('axios');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');

const BASE_URL = 'https://api.mercadopago.com';
const AUTH_URL_DEFAULT = 'https://auth.mercadopago.com/authorization';

/** HTTP autenticado. Usa o token informado (vendedor) ou o da plataforma. */
async function http(accessToken = null) {
  let token = accessToken;
  if (!token) {
    const gw = await settings.activeGateway('mercado_pago');
    if (!gw || !gw.accessToken) {
      throw new AppError('Gateway de pagamento não configurado. Configure no painel admin.', 503, 'GATEWAY_NOT_CONFIGURED');
    }
    token = gw.accessToken;
  }
  return axios.create({
    baseURL: BASE_URL,
    timeout: 20000,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
}

async function appCredentials() {
  const gw = await settings.activeGateway('mercado_pago');
  if (!gw || !gw.clientId || !gw.clientSecret) {
    throw new AppError('Credenciais OAuth da aplicação não configuradas no painel admin.', 503, 'OAUTH_NOT_CONFIGURED');
  }
  return gw;
}

/* -------------------------------- OAuth -------------------------------- */

/** Monta a URL de autorização para o vendedor vincular a conta. */
async function getAuthorizationUrl({ redirectUri, state }) {
  const gw = await appCredentials();
  const authBase = (await settings.get('payment.oauth_authorization_url', AUTH_URL_DEFAULT)) || AUTH_URL_DEFAULT;
  const params = new URLSearchParams({
    client_id: gw.clientId,
    response_type: 'code',
    platform_id: 'mp',
    state,
    redirect_uri: redirectUri,
  });
  return `${authBase}?${params.toString()}`;
}

/** Troca o `code` do callback por tokens do vendedor. */
async function exchangeCode({ code, redirectUri }) {
  const gw = await appCredentials();
  const api = axios.create({ baseURL: BASE_URL, timeout: 20000 });
  const { data } = await api.post('/oauth/token', {
    client_id: gw.clientId,
    client_secret: gw.clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });
  return data; // { access_token, refresh_token, user_id, public_key, expires_in, scope, ... }
}

/** Renova o access_token do vendedor usando o refresh_token. */
async function refreshToken({ refreshToken }) {
  const gw = await appCredentials();
  const api = axios.create({ baseURL: BASE_URL, timeout: 20000 });
  const { data } = await api.post('/oauth/token', {
    client_id: gw.clientId,
    client_secret: gw.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  return data;
}

/* ----------------------------- Pagamentos ----------------------------- */

/**
 * Cria uma preferência de checkout (Checkout Pro). Para split nativo, informe
 * `sellerAccessToken` e `marketplaceFee`.
 * @param {object} p { items, payer, externalReference, marketplaceFee, notificationUrl,
 *   backUrls, metadata, sellerAccessToken, binaryMode, statementDescriptor, advancedOptions }
 */
async function createPreference(p) {
  const api = await http(p.sellerAccessToken || null);
  const body = {
    items: p.items,
    payer: p.payer,
    external_reference: p.externalReference,
    notification_url: p.notificationUrl,
    metadata: p.metadata || {},
    back_urls: p.backUrls || {},
    auto_return: 'approved',
    ...(p.advancedOptions || {}),
  };
  if (p.marketplaceFee != null) body.marketplace_fee = Number(p.marketplaceFee);
  if (p.binaryMode != null) body.binary_mode = !!p.binaryMode;
  if (p.statementDescriptor) body.statement_descriptor = p.statementDescriptor;
  const { data } = await api.post('/checkout/preferences', body);
  return data;
}

/**
 * Cria pagamento direto via Checkout API (split com application_fee).
 * @param {object} p { amount, description, payerEmail, externalReference, token, paymentMethodId,
 *   installments, applicationFee, capture, sellerAccessToken, binaryMode, statementDescriptor,
 *   moneyReleaseDays, notificationUrl, metadata, advancedOptions }
 */
async function createPayment(p) {
  const api = await http(p.sellerAccessToken || null);
  const body = {
    transaction_amount: Number(p.amount),
    description: p.description,
    payment_method_id: p.paymentMethodId,
    payer: {
      email: p.payerEmail,
      ...(p.payerFirstName ? { first_name: p.payerFirstName } : {}),
      ...(p.payerLastName ? { last_name: p.payerLastName } : {}),
      ...(p.payerIdentification ? { identification: p.payerIdentification } : {}),
    },
    external_reference: p.externalReference,
    metadata: p.metadata || {},
    ...(p.advancedOptions || {}),
  };
  // notification_url só se for URL pública válida (o MP recusa localhost/null).
  if (p.notificationUrl && /^https:\/\//i.test(p.notificationUrl)) body.notification_url = p.notificationUrl;
  if (p.token) body.token = p.token;
  if (p.installments != null) body.installments = Number(p.installments);
  if (p.applicationFee != null) body.application_fee = Number(p.applicationFee);
  if (p.capture != null) body.capture = !!p.capture; // false = apenas autoriza (segura o dinheiro)
  if (p.binaryMode != null) body.binary_mode = !!p.binaryMode;
  if (p.statementDescriptor) body.statement_descriptor = p.statementDescriptor;
  if (p.moneyReleaseDays != null) body.money_release_days = Number(p.moneyReleaseDays);
  // O MP exige X-Idempotency-Key em /v1/payments. Usa o id do pagamento local
  // (externalReference) como chave — única por tentativa e idempotente em retries.
  const idempotencyKey = String(p.idempotencyKey || p.externalReference || `mp-${Date.now()}`);
  try {
    const { data } = await api.post('/v1/payments', body, {
      headers: { 'X-Idempotency-Key': idempotencyKey },
    });
    return data;
  } catch (e) {
    const detail = e.response && e.response.data;
    const msg =
      (detail && (detail.message || (detail.cause && detail.cause[0] && detail.cause[0].description))) ||
      e.message;
    throw new AppError(`Mercado Pago: ${msg}`, 502, 'MP_PAYMENT_ERROR', detail);
  }
}

/** Pix imediato (Checkout API). */
async function createPixPayment(p) {
  return createPayment({ ...p, paymentMethodId: p.paymentMethodId || 'pix' });
}

/**
 * Captura (libera) um pagamento previamente autorizado com capture=false.
 * Total ou parcial. Usa o token do vendedor quando informado.
 */
async function capturePayment(paymentId, { sellerAccessToken = null, amount = null } = {}) {
  const api = await http(sellerAccessToken);
  const body = { capture: true };
  if (amount != null) body.transaction_amount = Number(amount);
  const { data } = await api.put(`/v1/payments/${paymentId}`, body);
  return data;
}

async function getPayment(paymentId, sellerAccessToken = null) {
  const api = await http(sellerAccessToken);
  const { data } = await api.get(`/v1/payments/${paymentId}`);
  return data;
}

async function refundPayment(paymentId, amount = null, sellerAccessToken = null) {
  const api = await http(sellerAccessToken);
  const body = amount != null ? { amount: Number(amount) } : {};
  const { data } = await api.post(`/v1/payments/${paymentId}/refunds`, body);
  return data;
}

module.exports = {
  getAuthorizationUrl,
  exchangeCode,
  refreshToken,
  createPreference,
  createPayment,
  createPixPayment,
  capturePayment,
  getPayment,
  refundPayment,
};
