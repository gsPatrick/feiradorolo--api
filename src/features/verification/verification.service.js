'use strict';

/**
 * Verificação de e-mail e telefone/WhatsApp do usuário.
 * Gera códigos de 6 dígitos, guarda apenas o hash sha256 (validade 15 min),
 * limita reenvio (60s) e tentativas (máx. 5). Envia e-mail via emailProvider e
 * WhatsApp via Z-API.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const emailProvider = require('../../providers/email/email.provider');
const zapi = require('../../providers/zapi/zapi.provider');
const settings = require('../../services/settings.cache');

const CODE_TTL_MS = 15 * 60 * 1000; // 15 min
const RESEND_COOLDOWN_MS = 60 * 1000; // 60s
const MAX_ATTEMPTS = 5;

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hash(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

/** Carrega o usuário fresco do banco (campos atuais). */
async function freshUser(user) {
  const u = await db.User.findByPk(user.id);
  if (!u) throw AppError.notFound('Usuário não encontrado.', 'USER_NOT_FOUND');
  return u;
}

/** Recusa se houver código não-consumido recém-criado (< 60s). */
async function assertNotRateLimited(userId, channel) {
  const recent = await db.VerificationCode.findOne({
    where: {
      user_id: userId,
      channel,
      consumed_at: null,
      created_at: { [Op.gt]: new Date(Date.now() - RESEND_COOLDOWN_MS) },
    },
    order: [['created_at', 'DESC']],
  });
  if (recent) throw new AppError('Aguarde para reenviar.', 429, 'VERIFICATION_RATE_LIMITED');
}

/** Invalida (consome) códigos pendentes anteriores do canal. */
async function invalidatePending(userId, channel) {
  await db.VerificationCode.update(
    { consumed_at: new Date() },
    { where: { user_id: userId, channel, consumed_at: null } }
  );
}

/** Cria um novo código e devolve o valor em claro (para envio). */
async function issueCode(userId, channel) {
  const code = generateCode();
  await db.VerificationCode.create({
    user_id: userId,
    channel,
    code_hash: hash(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS),
    attempts: 0,
  });
  return code;
}

/** Valida o código informado e marca como consumido. */
async function consumeCode(user, channel, code) {
  if (!code) throw AppError.badRequest('Código é obrigatório.', 'CODE_REQUIRED');

  const record = await db.VerificationCode.findOne({
    where: { user_id: user.id, channel, consumed_at: null },
    order: [['created_at', 'DESC']],
  });
  if (!record) throw AppError.badRequest('Código inválido.', 'INVALID_CODE');

  record.attempts += 1;
  await record.save();

  if (record.expires_at && record.expires_at.getTime() < Date.now()) {
    throw AppError.badRequest('Código expirado.', 'CODE_EXPIRED');
  }
  if (record.attempts > MAX_ATTEMPTS) {
    throw AppError.badRequest('Muitas tentativas. Solicite um novo código.', 'TOO_MANY_ATTEMPTS');
  }
  if (record.code_hash !== hash(code)) {
    throw AppError.badRequest('Código inválido.', 'INVALID_CODE');
  }

  record.consumed_at = new Date();
  await record.save();
  return record;
}

async function requestEmail(user) {
  const u = await freshUser(user);
  if (u.email_verified_at) return { already: true };
  if (!u.email) throw AppError.unprocessable('Cadastre um e-mail primeiro.', 'EMAIL_REQUIRED');

  await assertNotRateLimited(u.id, 'email');
  await invalidatePending(u.id, 'email');
  const code = await issueCode(u.id, 'email');

  const web = await settings.get('app.web_url', '');
  const verify_url = `${web}/verificar-email?code=${code}`;

  await emailProvider.sendEmail({
    to: u.email,
    toName: u.name,
    templateKey: 'verificacao-email',
    vars: { name: u.name, code, verify_url },
  });

  return { sent: true };
}

async function confirmEmail(user, code) {
  const u = await freshUser(user);
  if (u.email_verified_at) return { verified: true, already: true };

  await consumeCode(u, 'email', code);
  u.email_verified_at = new Date();
  await u.save();
  return { verified: true };
}

async function requestPhone(user) {
  const u = await freshUser(user);
  if (!u.phone) throw AppError.unprocessable('Cadastre um telefone primeiro.', 'PHONE_REQUIRED');
  if (u.phone_verified_at) return { already: true };
  if (!(await zapi.isConfigured())) {
    throw new AppError('Integração WhatsApp (Z-API) não configurada.', 503, 'WHATSAPP_NOT_CONFIGURED');
  }

  await assertNotRateLimited(u.id, 'phone');
  await invalidatePending(u.id, 'phone');
  const code = await issueCode(u.id, 'phone');

  await zapi.sendText(
    u.phone,
    `Feira do Rolo: seu código de verificação é ${code}. Expira em 15 min.`
  );

  return { sent: true };
}

async function confirmPhone(user, code) {
  const u = await freshUser(user);
  if (u.phone_verified_at) return { verified: true, already: true };

  await consumeCode(u, 'phone', code);
  u.phone_verified_at = new Date();
  await u.save();
  return { verified: true };
}

async function status(user) {
  const u = await freshUser(user);
  return {
    email_verified: !!u.email_verified_at,
    phone_verified: !!u.phone_verified_at,
    phone: u.phone || null,
    cpf_informed: !!u.cpf,
  };
}

module.exports = { requestEmail, confirmEmail, requestPhone, confirmPhone, status };
