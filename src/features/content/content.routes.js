'use strict';

/**
 * Rotas de páginas de conteúdo (institucionais). Leitura pública; gestão restrita
 * ao admin (settings.manage). Montado em /content-pages sob /api/v1.
 */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./content.controller');

const router = Router();

// Admin: lista completa (inclui não publicadas). Antes de '/:slug'.
router.get('/all', auth, authorize('settings.manage'), controller.listAll);

// Pública.
router.get('/', controller.listPublic);
router.get('/:slug', controller.getBySlug);

// Admin: upsert/remoção por slug.
router.put('/:slug', auth, authorize('settings.manage'), controller.upsert);
router.delete('/:slug', auth, authorize('settings.manage'), controller.remove);

module.exports = router;
