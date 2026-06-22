'use strict';

const catchAsync = require('../../utils/catchAsync');
const service = require('./presence.service');

/** POST /presence/ping — heartbeat público. Resposta rápida 204. */
const ping = catchAsync(async (req, res) => {
  const { session_id, path } = req.body || {};
  await service.ping({ session_id, path, user_id: req.user?.id || null });
  return res.status(204).end();
});

module.exports = { ping };
