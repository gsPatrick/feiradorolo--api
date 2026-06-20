'use strict';

const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/** Normaliza erros do Sequelize em AppError com status adequado. */
function normalize(err) {
  if (err instanceof AppError) return err;

  if (err && err.name === 'SequelizeUniqueConstraintError') {
    const fields = (err.errors || []).map((e) => e.path).join(', ');
    return new AppError(`Já existe registro com esse valor (${fields}).`, 409, 'UNIQUE_VIOLATION');
  }
  if (err && err.name === 'SequelizeValidationError') {
    const details = (err.errors || []).map((e) => ({ field: e.path, message: e.message }));
    return new AppError('Falha de validação.', 422, 'VALIDATION', details);
  }
  if (err && err.name === 'SequelizeForeignKeyConstraintError') {
    return new AppError('Referência inválida (chave estrangeira).', 409, 'FK_VIOLATION');
  }
  if (err && (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError')) {
    return new AppError('Token inválido ou expirado.', 401, 'INVALID_TOKEN');
  }
  return new AppError(err.message || 'Erro interno', 500, 'INTERNAL');
}

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  const appErr = normalize(err);
  if (appErr.statusCode >= 500) logger.error(err.stack || err);
  else logger.debug(appErr.code, appErr.message);

  const body = {
    success: false,
    error: { code: appErr.code, message: appErr.message },
  };
  if (appErr.details) body.error.details = appErr.details;
  if (process.env.NODE_ENV !== 'production' && appErr.statusCode >= 500) {
    body.error.stack = err.stack;
  }
  res.status(appErr.statusCode).json(body);
};
