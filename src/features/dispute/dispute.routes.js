'use strict';

/** Rotas de Devolução/Disputa (/api/v1/disputes). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./dispute.controller');

const router = Router();

// Admin (mediação) — declarado antes de '/:id' para não colidir com 'admin'.
router.get('/admin/all', auth, authorize('orders.view'), controller.listAdmin);
router.post('/:id/resolve', auth, authorize('orders.resolve_dispute'), controller.resolve);

// Comprador.
router.post('/', auth, controller.requestReturn);
router.get('/', auth, controller.listMine);
router.get('/:id', auth, controller.getById);

// Vendedor.
router.post('/:id/approve', auth, controller.approveReturn);
router.post('/:id/reject', auth, controller.rejectReturn);
// (Re)gera a etiqueta de devolução (frete reverso). Vendedor envolvido/admin — checado no service.
router.post('/:id/return-label', auth, controller.returnLabel);

module.exports = router;
