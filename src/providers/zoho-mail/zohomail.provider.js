'use strict';

/**
 * Provider de e-mail via Zoho Mail API (OAuth 2.0 Self Client).
 *
 *   refresh_token -> access_token (cacheado 1h) -> POST /api/accounts/{id}/messages
 *
 * Credenciais em integration_settings('zoho_mail'):
 *   credentials.client_id, credentials.client_secret, credentials.refresh_token, credentials.account_id
 *   config.from_address, config.accounts_host (default accounts.zoho.com), config.mail_host (default mail.zoho.com)
 */
const axios = require('axios');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

// Cache do access_token em memória (por processo).
let _accessToken = null;
let _expiresAt = 0;

async function cfg() {
  const c = await settings.integration('zoho_mail');
  const cr = (c && c.credentials) || {};
  const cf = (c && c.config) || {};
  return {
    clientId: cr.client_id,
    clientSecret: cr.client_secret,
    refreshToken: cr.refresh_token,
    accountId: cr.account_id || cf.account_id,
    fromAddress: cf.from_address || (await settings.get('mail.from_email', '')),
    accountsHost: cf.accounts_host || 'https://accounts.zoho.com',
    mailHost: cf.mail_host || 'https://mail.zoho.com',
  };
}

/** Está pronto para enviar (tem client + refresh_token + accountId)? */
async function isConfigured() {
  const c = await cfg();
  return !!(c.clientId && c.clientSecret && c.refreshToken && c.accountId);
}

/** Gera/renova o access_token a partir do refresh_token (cacheado). */
async function getAccessToken(force = false) {
  const c = await cfg();
  if (!c.refreshToken || !c.clientId || !c.clientSecret) {
    throw new AppError('Zoho Mail não configurado (refresh_token/credenciais ausentes).', 503, 'ZOHO_NOT_CONFIGURED');
  }
  if (!force && _accessToken && Date.now() < _expiresAt - 60_000) return _accessToken;

  const { data } = await axios.post(`${c.accountsHost}/oauth/v2/token`, null, {
    params: {
      grant_type: 'refresh_token',
      refresh_token: c.refreshToken,
      client_id: c.clientId,
      client_secret: c.clientSecret,
    },
    timeout: 15000,
  });
  if (!data || !data.access_token) {
    throw new AppError('Zoho: falha ao renovar o token.', 502, 'ZOHO_TOKEN_ERROR', data);
  }
  _accessToken = data.access_token;
  _expiresAt = Date.now() + (data.expires_in || 3600) * 1000;
  return _accessToken;
}

/** Troca o grant code (setup único) por refresh_token. Usado num script/admin. */
async function exchangeCode({ code, clientId, clientSecret, accountsHost = 'https://accounts.zoho.com' }) {
  const { data } = await axios.post(`${accountsHost}/oauth/v2/token`, null, {
    params: { grant_type: 'authorization_code', client_id: clientId, client_secret: clientSecret, code },
    timeout: 15000,
  });
  return data; // { access_token, refresh_token, api_domain, expires_in, ... }
}

/** Lista as contas (para descobrir o accountId). */
async function listAccounts({ accessToken, mailHost = 'https://mail.zoho.com' }) {
  const { data } = await axios.get(`${mailHost}/api/accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
    timeout: 15000,
  });
  return (data && data.data) || [];
}

/** Envia um e-mail (HTML). Compatível com a interface do email.provider. */
async function sendEmail({ to, subject, html, fromName }) {
  const c = await cfg();
  if (!c.accountId || !c.fromAddress) {
    throw new AppError('Zoho Mail não configurado (accountId/from_address).', 503, 'ZOHO_NOT_CONFIGURED');
  }
  const body = {
    fromAddress: fromName ? `${fromName} <${c.fromAddress}>` : c.fromAddress,
    toAddress: to,
    subject,
    content: html || '<p></p>',
    mailFormat: 'html',
  };
  const post = (token) =>
    axios.post(`${c.mailHost}/api/accounts/${c.accountId}/messages`, body, {
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });

  let token = await getAccessToken();
  let res;
  try {
    res = await post(token);
  } catch (e) {
    if (e.response && e.response.status === 401) {
      token = await getAccessToken(true);
      res = await post(token);
    } else {
      throw _err(e);
    }
  }
  const d = res.data;
  // Zoho às vezes retorna HTTP 200 com erro em status.code.
  if (d && d.status && d.status.code && Number(d.status.code) >= 400) {
    throw new AppError(`Zoho: ${d.status.description || 'erro no envio'}`, 502, 'ZOHO_SEND_ERROR', d);
  }
  return { sent: true, provider: 'zoho_mail', messageId: d && d.data && d.data.messageId };
}

function _err(e) {
  const detail = e.response && e.response.data;
  const msg = (detail && (detail.message || (detail.status && detail.status.description))) || e.message;
  logger.warn(`zohomail.sendEmail falhou: ${msg}`);
  return new AppError(`Zoho Mail: ${msg}`, 502, 'ZOHO_SEND_ERROR', detail);
}

module.exports = { sendEmail, isConfigured, getAccessToken, exchangeCode, listAccounts, cfg };
