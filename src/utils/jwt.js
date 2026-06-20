'use strict';

/** Assinatura/validação de JWT. A revogação usa token_blacklist (ver auth). */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'feiradorolo-dev-secret';
// Validade padrão; a aplicação sobrescreve via opção expiresIn (de auth.jwt_expires_in no banco).
const EXPIRES_IN = '7d';

/** Assina um token incluindo um jti único (para revogação). */
function sign(payload, options = {}) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ ...payload, jti }, SECRET, { expiresIn: EXPIRES_IN, ...options });
  return { token, jti };
}

function verify(token) {
  return jwt.verify(token, SECRET);
}

function decode(token) {
  return jwt.decode(token);
}

/** Converte o exp (segundos) do token em Date, para gravar na blacklist. */
function expiryDate(decoded) {
  if (decoded && decoded.exp) return new Date(decoded.exp * 1000);
  return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
}

module.exports = { sign, verify, decode, expiryDate };
