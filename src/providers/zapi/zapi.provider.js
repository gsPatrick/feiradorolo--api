'use strict';

/**
 * Provider de WhatsApp via Z-API (https://developer.z-api.io).
 *
 * Envia mensagem de texto:
 *   POST https://api.z-api.io/instances/{instanceId}/token/{token}/send-text
 *   header:  Client-Token: <account security token>
 *   body:    { phone: "5511999999999", message: "..." }
 *
 * Credenciais (admin → Integrações → Z-API), em integration_settings('zapi'):
 *   config.instance_id      — ID da instância (vai na URL)
 *   credentials.token       — token da instância (vai na URL)
 *   credentials.client_token — Account Security Token (header Client-Token)
 */
const axios = require('axios');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');

const BASE = 'https://api.z-api.io';

function onlyDigits(s) {
  return String(s || '').replace(/\D/g, '');
}

/** Normaliza o telefone para o formato do WhatsApp (DDI 55 + DDD + número). */
function normalizePhone(phone) {
  let d = onlyDigits(phone);
  if (!d) return '';
  if (d.length <= 11) d = `55${d}`; // sem DDI -> assume Brasil
  return d;
}

async function config() {
  const cfg = await settings.integration('zapi');
  const instanceId = (cfg && cfg.config && (cfg.config.instance_id || cfg.config.instanceId)) ||
    (cfg && cfg.credentials && cfg.credentials.instance_id);
  const token = cfg && cfg.credentials && cfg.credentials.token;
  const clientToken = cfg && cfg.credentials && (cfg.credentials.client_token || cfg.credentials.clientToken);
  if (!instanceId || !token) {
    throw new AppError('Integração WhatsApp (Z-API) não configurada.', 503, 'WHATSAPP_NOT_CONFIGURED');
  }
  return { instanceId, token, clientToken };
}

/** Indica se a Z-API está configurada (sem lançar erro). */
async function isConfigured() {
  try {
    await config();
    return true;
  } catch {
    return false;
  }
}

/** Envia uma mensagem de texto pelo WhatsApp. */
async function sendText(phone, message) {
  const { instanceId, token, clientToken } = await config();
  const to = normalizePhone(phone);
  if (!to) throw new AppError('Telefone inválido.', 422, 'INVALID_PHONE');
  try {
    const { data } = await axios.post(
      `${BASE}/instances/${instanceId}/token/${token}/send-text`,
      { phone: to, message },
      {
        headers: { 'Content-Type': 'application/json', ...(clientToken ? { 'Client-Token': clientToken } : {}) },
        timeout: 15000,
      }
    );
    return { sent: true, provider: 'zapi', id: data && (data.messageId || data.id) };
  } catch (e) {
    const detail = e.response && e.response.data;
    const msg = (detail && (detail.message || detail.error)) || e.message;
    throw new AppError(`Z-API: ${msg}`, 502, 'WHATSAPP_SEND_ERROR', detail);
  }
}

module.exports = { sendText, isConfigured, normalizePhone, config };
