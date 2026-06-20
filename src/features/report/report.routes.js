'use strict';

/** Rotas de Denúncias (/api/v1/reports). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./report.controller');

const router = Router();

// Admin (moderação) — antes das paramétricas.
router.get('/admin', auth, authorize('chat.view'), controller.adminList);
router.patch('/admin/:id', auth, authorize('chat.moderate'), controller.adminResolve);

// Usuário denuncia conteúdo.
router.post('/', auth, controller.create);

module.exports = router;
