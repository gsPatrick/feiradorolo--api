'use strict';

/**
 * Rotas de Produtos (anúncios) e upsell de Destaque.
 * Listagem/detalhe são públicos (optionalAuth); criação/edição exigem sessão.
 * Moderação (mudança de status) exige specifications.manage.
 */
const { Router } = require('express');
const { optionalAuth, auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./product.controller');

const router = Router();

// Públicas.
router.get('/', optionalAuth, controller.list);
// Catálogo público dos pacotes de destaque (antes de '/:id' para não ser capturado como id).
router.get('/highlight-packages', controller.highlightPackages);
router.get('/:id', optionalAuth, controller.getById);

// Histórico/status de destaque do produto (dono ou admin).
router.get('/:id/highlights', auth, controller.listHighlights);

// Gestão pelo vendedor.
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);
router.post('/:id/publish', auth, controller.publish);

// Upsell de destaque (Pix imediato).
router.post('/:id/highlight', auth, controller.purchaseHighlight);
// (Re)gera o Pix de um destaque pendente do produto (dono).
router.post('/:id/highlights/:highlightId/pay', auth, controller.payHighlight);

// Moderação admin (aprovar/rejeitar anúncio).
router.patch('/:id/status', auth, authorize('specifications.manage'), controller.setStatus);

module.exports = router;
