'use strict';

/**
 * Rotas de Perguntas & Respostas. Listagem por produto é pública; perguntar e
 * responder exigem sessão. Montado em /questions sob /api/v1.
 */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./question.controller');

const router = Router();

router.get('/', controller.list); // ?product_id=
router.post('/', auth, controller.ask);
router.post('/:id/answer', auth, controller.answer);

module.exports = router;
