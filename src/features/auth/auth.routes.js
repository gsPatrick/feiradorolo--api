'use strict';

/** Rotas de autenticação (/api/v1/auth). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./auth.controller');

const router = Router();

// Públicas.
router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/social', controller.social);

// Autenticadas.
router.post('/logout', auth, controller.logout);
router.get('/me', auth, controller.me);

module.exports = router;
