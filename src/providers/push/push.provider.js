'use strict';

/**
 * Provider de Push. Suporta FCM (HTTP v1, OAuth2 via service account) e
 * OneSignal (REST). O provider ativo e as credenciais vêm de
 * integration_settings (admin) — nada de .env nem chave legada.
 *
 * Correção importante: a API legada do FCM (Authorization: key=SERVER_KEY) foi
 * descontinuada. Usamos a HTTP v1: gera-se um access_token OAuth2 assinando um
 * JWT com a service account e POST em
 *   https://fcm.googleapis.com/v1/projects/{projectId}/messages:send
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let fcmTokenCache = { at: 0, token: null, email: null };

/** Descobre qual provider de push está ativo (fcm ou onesignal). */
async function activeProvider() {
  const fcm = await settings.integration('fcm');
  if (fcm) return { name: 'fcm', cfg: fcm };
  const one = await settings.integration('onesignal');
  if (one) return { name: 'onesignal', cfg: one };
  return null;
}

/* ------------------------------ FCM v1 -------------------------------- */

function normalizePrivateKey(key) {
  return key ? String(key).replace(/\\n/g, '\n') : key;
}

/** Gera (e cacheia ~55min) um access_token OAuth2 para o FCM. */
async function fcmAccessToken(serviceAccount) {
  const clientEmail = serviceAccount.client_email;
  const privateKey = normalizePrivateKey(serviceAccount.private_key);
  if (!clientEmail || !privateKey) {
    throw new AppError('Service account do FCM incompleta (client_email/private_key).', 503, 'PUSH_NOT_CONFIGURED');
  }
  if (fcmTokenCache.token && fcmTokenCache.email === clientEmail && Date.now() - fcmTokenCache.at < 55 * 60 * 1000) {
    return fcmTokenCache.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: clientEmail, scope: FCM_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3600 },
    privateKey,
    { algorithm: 'RS256' }
  );
  const { data } = await axios.post(
    GOOGLE_TOKEN_URL,
    new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  fcmTokenCache = { at: Date.now(), token: data.access_token, email: clientEmail };
  return data.access_token;
}

async function sendFcm(cfg, { tokens, title, body, data }) {
  const sa = (cfg.credentials && (cfg.credentials.serviceAccount || cfg.credentials)) || {};
  const projectId = (cfg.config && cfg.config.projectId) || sa.project_id;
  if (!projectId) throw new AppError('projectId do FCM não configurado.', 503, 'PUSH_NOT_CONFIGURED');
  const accessToken = await fcmAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  const results = [];
  for (const token of tokens) {
    try {
      const message = {
        message: {
          token,
          notification: { title, body },
          data: data ? Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) : undefined,
        },
      };
      const { data: resp } = await axios.post(url, message, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      results.push({ token, ok: true, id: resp.name });
    } catch (err) {
      const status = err.response && err.response.status;
      results.push({ token, ok: false, status, error: err.response?.data?.error?.message || err.message });
    }
  }
  return { provider: 'fcm', results };
}

/* ----------------------------- OneSignal ------------------------------ */

async function sendOneSignal(cfg, { tokens, title, body, data, externalUserIds }) {
  const appId = (cfg.config && cfg.config.appId) || (cfg.credentials && cfg.credentials.appId);
  const restApiKey = cfg.credentials && cfg.credentials.restApiKey;
  if (!appId || !restApiKey) throw new AppError('OneSignal não configurado (appId/restApiKey).', 503, 'PUSH_NOT_CONFIGURED');

  const payload = {
    app_id: appId,
    headings: { en: title, pt: title },
    contents: { en: body, pt: body },
    data: data || undefined,
  };
  if (externalUserIds && externalUserIds.length) payload.include_external_user_ids = externalUserIds;
  else payload.include_player_ids = tokens;

  const { data: resp } = await axios.post('https://onesignal.com/api/v1/notifications', payload, {
    headers: { Authorization: `Basic ${restApiKey}`, 'Content-Type': 'application/json' },
    timeout: 15000,
  });
  return { provider: 'onesignal', id: resp.id, recipients: resp.recipients };
}

/* ------------------------------- API ---------------------------------- */

/**
 * Envia um push. `tokens` = tokens de dispositivo (FCM) ou player_ids
 * (OneSignal). Lança 503 amigável se nenhum provider estiver configurado.
 */
async function send({ tokens = [], title, body, data, externalUserIds }) {
  const active = await activeProvider();
  if (!active) throw new AppError('Nenhum provedor de push configurado no painel admin.', 503, 'PUSH_NOT_CONFIGURED');
  if ((!tokens || !tokens.length) && (!externalUserIds || !externalUserIds.length)) {
    return { skipped: true, reason: 'NO_TARGETS' };
  }
  try {
    if (active.name === 'fcm') return await sendFcm(active.cfg, { tokens, title, body, data });
    return await sendOneSignal(active.cfg, { tokens, title, body, data, externalUserIds });
  } catch (err) {
    if (err instanceof AppError) throw err;
    logger.error('push.send falhou:', err.message);
    throw new AppError('Falha ao enviar push.', 502, 'PUSH_SEND_FAILED');
  }
}

module.exports = { send, activeProvider };
