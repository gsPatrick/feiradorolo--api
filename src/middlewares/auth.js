'use strict';

/**
 * Autenticação JWT: valida o token, checa revogação (token_blacklist) e carrega
 * o usuário em req.user. Use `optionalAuth` em rotas públicas que enriquecem a
 * resposta quando há sessão.
 */
const { Op } = require('sequelize');
const db = require('../models');
const jwtUtil = require('../utils/jwt');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

async function resolveUser(token) {
  const decoded = jwtUtil.verify(token);

  if (decoded.jti) {
    const revoked = await db.TokenBlacklist.findOne({
      where: { jti: decoded.jti, expires_at: { [Op.gt]: new Date() } },
    });
    if (revoked) throw new AppError('Sessão encerrada. Faça login novamente.', 401, 'TOKEN_REVOKED');
  }

  const user = await db.User.findByPk(decoded.sub || decoded.id);
  if (!user) throw new AppError('Usuário não encontrado.', 401, 'USER_NOT_FOUND');
  if (user.account_status === 'banned') throw new AppError('Conta banida.', 403, 'ACCOUNT_BANNED');
  if (user.account_status === 'suspended') throw new AppError('Conta suspensa.', 403, 'ACCOUNT_SUSPENDED');

  user.token = token;
  user.tokenPayload = decoded;
  return user;
}

const auth = catchAsync(async (req, res, next) => {
  const token = extractToken(req);
  if (!token) throw new AppError('Autenticação necessária.', 401, 'NO_TOKEN');
  req.user = await resolveUser(token);
  next();
});

const optionalAuth = catchAsync(async (req, res, next) => {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = await resolveUser(token);
    } catch (e) {
      req.user = null;
    }
  }
  next();
});

module.exports = { auth, optionalAuth };
