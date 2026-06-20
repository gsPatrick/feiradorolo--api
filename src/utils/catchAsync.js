'use strict';

/** Envolve handlers async e encaminha erros ao middleware de erro. */
module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
