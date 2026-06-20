'use strict';

/**
 * Rotas de Banners. Listagem pública (home/categoria); CRUD restrito ao admin
 * (settings.manage). Montado em /banners sob /api/v1.
 */
const { Router } = require('express');
const { optionalAuth, auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./banner.controller');

const router = Router();

// Pública: lista por posição (?position=home_hero|home_strip|home_flash|app_promo|...)
router.get('/', optionalAuth, controller.listPublic);

// Admin: todos os banners (inclui inativos/agendados).
router.get('/all', auth, authorize('settings.manage'), controller.listAll);

// Pública: detalhe.
router.get('/:id', optionalAuth, controller.getById);

// Admin: CRUD.
router.post('/', auth, authorize('settings.manage'), controller.create);
router.put('/:id', auth, authorize('settings.manage'), controller.update);
router.delete('/:id', auth, authorize('settings.manage'), controller.remove);

module.exports = router;
