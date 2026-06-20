'use strict';

/**
 * Erro operacional com statusCode e code estável para o cliente.
 * Erros não-operacionais (bugs) caem no handler como 500 genérico.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code = 'ERROR', details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Requisição inválida', code = 'BAD_REQUEST', details = null) {
    return new AppError(msg, 400, code, details);
  }
  static unauthorized(msg = 'Não autenticado', code = 'UNAUTHORIZED') {
    return new AppError(msg, 401, code);
  }
  static forbidden(msg = 'Acesso negado', code = 'FORBIDDEN') {
    return new AppError(msg, 403, code);
  }
  static notFound(msg = 'Recurso não encontrado', code = 'NOT_FOUND') {
    return new AppError(msg, 404, code);
  }
  static conflict(msg = 'Conflito', code = 'CONFLICT') {
    return new AppError(msg, 409, code);
  }
  static unprocessable(msg = 'Dados inválidos', code = 'UNPROCESSABLE', details = null) {
    return new AppError(msg, 422, code, details);
  }
}

module.exports = AppError;
