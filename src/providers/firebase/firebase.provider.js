'use strict';

/**
 * Provider do Firebase. Valida ID tokens de login social verificando a
 * assinatura RS256 com as chaves públicas do Google (secure token) e helpers
 * de Storage para montar URLs públicas de mídia. Config via integration_settings
 * (service='firebase'), com fallback para variáveis de ambiente.
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');

const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certsCache = { at: 0, certs: null };

async function projectId() {
  const cfg = await settings.integration('firebase');
  return (cfg && cfg.config && cfg.config.projectId) || null;
}

async function storageBucket() {
  const cfg = await settings.integration('firebase');
  return (cfg && cfg.config && cfg.config.storageBucket) || null;
}

async function getCerts() {
  if (certsCache.certs && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.certs;
  const { data } = await axios.get(CERTS_URL, { timeout: 10000 });
  certsCache = { at: Date.now(), certs: data };
  return data;
}

/** Verifica um Firebase ID token e retorna o payload (uid, email, name...). */
async function verifyIdToken(idToken) {
  if (!idToken) throw new AppError('Token social ausente.', 400, 'NO_SOCIAL_TOKEN');
  const decodedHeader = jwt.decode(idToken, { complete: true });
  if (!decodedHeader || !decodedHeader.header || !decodedHeader.header.kid) {
    throw new AppError('Token social inválido.', 401, 'INVALID_SOCIAL_TOKEN');
  }
  const certs = await getCerts();
  const cert = certs[decodedHeader.header.kid];
  if (!cert) throw new AppError('Chave de verificação não encontrada.', 401, 'INVALID_SOCIAL_TOKEN');

  const pid = await projectId();
  try {
    const payload = jwt.verify(idToken, cert, {
      algorithms: ['RS256'],
      audience: pid || undefined,
      issuer: pid ? `https://securetoken.google.com/${pid}` : undefined,
    });
    return {
      uid: payload.user_id || payload.sub,
      email: payload.email || null,
      emailVerified: !!payload.email_verified,
      name: payload.name || null,
      picture: payload.picture || null,
      provider: payload.firebase && payload.firebase.sign_in_provider,
    };
  } catch (e) {
    throw new AppError('Falha ao validar token social.', 401, 'INVALID_SOCIAL_TOKEN');
  }
}

/** Monta a URL pública de um objeto no Firebase Storage. */
async function publicUrl(objectPath) {
  const bucket = await storageBucket();
  if (!bucket) return null;
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encoded}?alt=media`;
}

module.exports = { verifyIdToken, publicUrl, storageBucket, projectId };
