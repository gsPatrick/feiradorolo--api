'use strict';

/**
 * Onboarding do repasse: vincula a conta do VENDEDOR ao marketplace via OAuth
 * do Mercado Pago e mantém o token válido (refresh automático). O access_token
 * resultante é usado para criar pagamentos com split/repasse nativo.
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');
const logger = require('../../utils/logger');
const jwtUtil = require('../../utils/jwt');
const { encrypt, decrypt } = require('../../utils/crypto');
const settings = require('../../services/settings.cache');
const mercadopago = require('../../providers/mercado-pago/mercadopago.provider');

const PROVIDER = 'mercado_pago';
const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000; // renova se faltam <7 dias

async function redirectUri() {
  const fromSettings = await settings.get('payment.oauth_redirect_uri', null);
  if (fromSettings) return fromSettings;
  const base = (await settings.get('app.public_url', '')) || 'http://localhost:3333';
  return `${base}/api/v1/payments/connect/mercado-pago/callback`;
}

function sanitize(account) {
  if (!account) return null;
  const a = account.toJSON ? account.toJSON() : account;
  return {
    id: a.id,
    user_id: a.user_id,
    provider: a.provider,
    mp_user_id: a.mp_user_id,
    public_key: a.public_key,
    status: a.status,
    is_active: a.is_active,
    expires_at: a.expires_at,
    linked_at: a.linked_at,
    linked: a.status === 'linked' && a.is_active,
  };
}

/** URL para o vendedor autorizar o vínculo (state assinado = id do vendedor). */
async function getAuthorizationUrl(sellerId) {
  const { token: state } = jwtUtil.sign({ sub: sellerId, scope: 'mp_oauth' }, { expiresIn: '15m' });
  const uri = await redirectUri();
  const url = await mercadopago.getAuthorizationUrl({ redirectUri: uri, state });
  return { url, state };
}

/** Callback do OAuth: valida o state, troca o code por tokens e persiste. */
async function handleCallback({ code, state }) {
  if (!code || !state) throw AppError.badRequest('Parâmetros OAuth ausentes.', 'OAUTH_MISSING_PARAMS');
  let decoded;
  try {
    decoded = jwtUtil.verify(state);
  } catch (e) {
    throw AppError.unauthorized('State OAuth inválido ou expirado.', 'OAUTH_INVALID_STATE');
  }
  if (decoded.scope !== 'mp_oauth') throw AppError.unauthorized('State OAuth inválido.', 'OAUTH_INVALID_STATE');
  const sellerId = decoded.sub;

  const uri = await redirectUri();
  const data = await mercadopago.exchangeCode({ code, redirectUri: uri });

  const expiresAt = data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : null;
  const payload = {
    user_id: sellerId,
    provider: PROVIDER,
    mp_user_id: data.user_id != null ? String(data.user_id) : null,
    public_key: data.public_key || null,
    access_token_encrypted: encrypt(data.access_token),
    refresh_token_encrypted: encrypt(data.refresh_token),
    scope: data.scope || null,
    status: 'linked',
    is_active: true,
    expires_at: expiresAt,
    linked_at: new Date(),
    raw: { live_mode: data.live_mode, token_type: data.token_type },
  };

  const existing = await db.SellerPaymentAccount.findOne({ where: { user_id: sellerId, provider: PROVIDER } });
  const account = existing ? await existing.update(payload) : await db.SellerPaymentAccount.create(payload);

  // Garante que o usuário esteja marcado como vendedor.
  await db.User.update({ is_seller: true }, { where: { id: sellerId } });
  return sanitize(account);
}

async function getStatus(sellerId) {
  const account = await db.SellerPaymentAccount.findOne({ where: { user_id: sellerId, provider: PROVIDER } });
  return sanitize(account);
}

async function unlink(sellerId) {
  const account = await db.SellerPaymentAccount.findOne({ where: { user_id: sellerId, provider: PROVIDER } });
  if (!account) throw AppError.notFound('Conta de recebimento não encontrada.', 'ACCOUNT_NOT_FOUND');
  await account.update({ is_active: false, status: 'revoked' });
  return sanitize(account);
}

/**
 * Retorna o access_token válido do vendedor (renovando se necessário) ou null
 * se ele não vinculou a conta. Usado pelo payment.service para o split.
 */
async function getActiveAccessToken(sellerId) {
  const account = await db.SellerPaymentAccount.findOne({
    where: { user_id: sellerId, provider: PROVIDER, is_active: true },
  });
  if (!account || account.status === 'revoked') return null;

  const expMs = account.expires_at ? new Date(account.expires_at).getTime() : 0;
  if (expMs && expMs - Date.now() < REFRESH_WINDOW_MS) {
    try {
      const refreshToken = decrypt(account.refresh_token_encrypted);
      if (refreshToken) {
        const data = await mercadopago.refreshToken({ refreshToken });
        await account.update({
          access_token_encrypted: encrypt(data.access_token),
          refresh_token_encrypted: data.refresh_token ? encrypt(data.refresh_token) : account.refresh_token_encrypted,
          expires_at: data.expires_in ? new Date(Date.now() + Number(data.expires_in) * 1000) : account.expires_at,
          status: 'linked',
        });
        return data.access_token;
      }
    } catch (err) {
      logger.error(`Falha ao renovar token MP do vendedor ${sellerId}:`, err.message);
      if (expMs < Date.now()) {
        await account.update({ status: 'expired' });
        return null;
      }
    }
  }
  return decrypt(account.access_token_encrypted);
}

module.exports = { getAuthorizationUrl, handleCallback, getStatus, unlink, getActiveAccessToken };
