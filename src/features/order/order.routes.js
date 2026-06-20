'use strict';

/** Rotas de Pedidos (/api/v1/orders). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./order.controller');

const router = Router();

// Admin (antes de '/:id' para evitar colisão).
router.get('/admin/all', auth, authorize('orders.view'), controller.listAll);
router.patch('/disputes/:id/resolve', auth, authorize('orders.resolve_dispute'), controller.resolveDispute);

router.post('/checkout', auth, controller.checkout);
router.get('/', auth, controller.list);
router.get('/:id', auth, controller.getById);
router.post('/:id/cancel', auth, controller.cancel);
router.post('/:id/disputes', auth, controller.openDispute);

module.exports = router;
