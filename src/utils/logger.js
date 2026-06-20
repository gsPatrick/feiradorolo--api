'use strict';

/** Logger mínimo com nível controlado por LOG_LEVEL (debug|info|warn|error). */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const current = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

function log(level, ...args) {
  if (LEVELS[level] < current) return;
  const ts = new Date().toISOString();
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(`[${ts}] ${level.toUpperCase()}`, ...args);
}

module.exports = {
  debug: (...a) => log('debug', ...a),
  info: (...a) => log('info', ...a),
  warn: (...a) => log('warn', ...a),
  error: (...a) => log('error', ...a),
};
