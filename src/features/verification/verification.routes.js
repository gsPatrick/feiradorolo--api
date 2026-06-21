'use strict';

/**
 * Rotas de verificação de e-mail e telefone/WhatsApp do usuário autenticado.
 * Montado em /verification sob /api/v1. Todas exigem sessão.
 */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./verification.controller');

const router = Router();

router.post('/email/request', auth, controller.requestEmail);
router.post('/email/confirm', auth, controller.confirmEmail);
router.post('/phone/request', auth, controller.requestPhone);
router.post('/phone/confirm', auth, controller.confirmPhone);
router.get('/status', auth, controller.status);

module.exports = router;
