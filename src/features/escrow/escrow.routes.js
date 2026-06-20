'use strict';

/** Rotas de Escrow (/api/v1/escrow). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./escrow.controller');

const router = Router();

router.get('/admin/pending', auth, authorize('orders.view'), controller.listPending);
router.post('/admin/order/:orderId/freeze', auth, authorize('orders.view'), controller.freeze);
router.post('/admin/order/:orderId/unfreeze', auth, authorize('orders.view'), controller.unfreeze);
router.get('/order/:orderId', auth, controller.getByOrder);
router.post('/order/:orderId/release', auth, controller.releaseManual);
router.post('/order/:orderId/release-token', auth, controller.releaseByToken);

module.exports = router;
