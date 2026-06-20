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
router.get('/:id', optionalAuth, controller.getById);

// Gestão pelo vendedor.
router.post('/', auth, controller.create);
router.put('/:id', auth, controller.update);
router.delete('/:id', auth, controller.remove);
router.post('/:id/publish', auth, controller.publish);

// Upsell de destaque (Pix imediato).
router.post('/:id/highlight', auth, controller.purchaseHighlight);

// Moderação admin (aprovar/rejeitar anúncio).
router.patch('/:id/status', auth, authorize('specifications.manage'), controller.setStatus);

module.exports = router;
