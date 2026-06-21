'use strict';

/**
 * Provider de e-mail transacional. Renderiza templates de message_templates e
 * envia pelo provedor ATIVO em integration_settings: Brevo (HTTP API) ou Zoho
 * (ZeptoMail HTTP API). O admin escolhe qual ativar — nada hardcoded.
 *
 *   Brevo:  POST https://api.brevo.com/v3/smtp/email        header: api-key
 *   Zoho:   POST https://api.zeptomail.com/v1.1/email        header: Authorization: Zoho-enczapikey <key>
 */
const axios = require('axios');
const db = require('../../models');
const settings = require('../../services/settings.cache');
const logger = require('../../utils/logger');

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const ZEPTO_URL = 'https://api.zeptomail.com/v1.1/email';
const RESEND_URL = 'https://api.resend.com/emails';

/** Substitui {{var}} no texto pelos valores fornecidos. */
function render(template, vars = {}) {
  if (!template) return '';
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

async function loadTemplate(key, channel = 'email', locale = 'pt-BR') {
  return db.MessageTemplate.findOne({ where: { key, channel, locale, is_active: true } });
}

/** Lê a API key tolerando camelCase (apiKey) ou snake_case (api_key). */
function apiKeyOf(cfg) {
  return cfg && cfg.credentials && (cfg.credentials.apiKey || cfg.credentials.api_key);
}

/** Resolve o provedor ativo (resend > brevo > zoho) e suas credenciais — só do banco. */
async function resolveProvider() {
  const resend = await settings.integration('resend');
  if (apiKeyOf(resend)) return { name: 'resend', cfg: resend };
  const brevo = await settings.integration('brevo');
  if (apiKeyOf(brevo)) return { name: 'brevo', cfg: brevo };
  const zoho = await settings.integration('zoho');
  if (apiKeyOf(zoho)) return { name: 'zoho', cfg: zoho };
  return null;
}

/** Remetente: config da integração (camel ou snake) ou settings globais mail.from_* (admin). */
async function senderFrom(cfg) {
  const c = (cfg && cfg.config) || {};
  return {
    email: c.senderEmail || c.sender_email || (await settings.get('mail.from_email', 'no-reply@feiradorolo.com')),
    name: c.senderName || c.sender_name || (await settings.get('mail.from_name', 'Feira do Rolo')),
  };
}

async function sendBrevo(cfg, { to, toName, subject, html }) {
  const sender = await senderFrom(cfg);
  const { data } = await axios.post(
    BREVO_URL,
    { sender, to: [{ email: to, name: toName || undefined }], subject, htmlContent: html || '<p></p>' },
    { headers: { 'api-key': apiKeyOf(cfg), 'Content-Type': 'application/json', accept: 'application/json' }, timeout: 15000 }
  );
  return { sent: true, provider: 'brevo', messageId: data.messageId };
}

async function sendZoho(cfg, { to, toName, subject, html }) {
  const sender = await senderFrom(cfg);
  const { data } = await axios.post(
    ZEPTO_URL,
    {
      from: { address: sender.email, name: sender.name },
      to: [{ email_address: { address: to, name: toName || to } }],
      subject,
      htmlbody: html || '<p></p>',
    },
    { headers: { Authorization: `Zoho-enczapikey ${apiKeyOf(cfg)}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return { sent: true, provider: 'zoho', data };
}

async function sendResend(cfg, { to, toName, subject, html }) {
  const sender = await senderFrom(cfg);
  const { data } = await axios.post(
    RESEND_URL,
    {
      from: `${sender.name} <${sender.email}>`,
      to: [to],
      subject,
      html: html || '<p></p>',
    },
    { headers: { Authorization: `Bearer ${apiKeyOf(cfg)}`, 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  return { sent: true, provider: 'resend', messageId: data && data.id };
}

/**
 * Envia e-mail. Com `templateKey`, usa message_templates (admin edita o conteúdo);
 * senão usa subject/html diretos.
 */
async function sendEmail({ to, subject, html, templateKey, vars = {}, toName }) {
  let finalSubject = subject;
  let finalHtml = html;
  if (templateKey) {
    const tpl = await loadTemplate(templateKey, 'email');
    if (tpl) {
      finalSubject = render(tpl.subject, vars);
      finalHtml = render(tpl.body, vars);
    }
  }

  const provider = await resolveProvider();
  if (!provider) {
    logger.warn(`E-mail não enviado (nenhum provedor configurado). to=${to} assunto="${finalSubject}"`);
    return { skipped: true, reason: 'NO_PROVIDER' };
  }

  const args = { to, toName, subject: finalSubject, html: finalHtml };
  if (provider.name === 'resend') return sendResend(provider.cfg, args);
  if (provider.name === 'zoho') return sendZoho(provider.cfg, args);
  return sendBrevo(provider.cfg, args);
}

module.exports = { sendEmail, render, loadTemplate, resolveProvider };
