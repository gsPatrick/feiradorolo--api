'use strict';

const AppError = require('../utils/AppError');

module.exports = function notFound(req, res, next) {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
};
