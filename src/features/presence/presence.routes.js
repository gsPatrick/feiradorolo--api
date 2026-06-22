'use strict';

/** Presença (heartbeat público). Montado em /presence sob /api/v1. */
const { Router } = require('express');
const { optionalAuth } = require('../../middlewares/auth');
const controller = require('./presence.controller');

const router = Router();

router.post('/ping', optionalAuth, controller.ping);

module.exports = router;
