'use strict';

/** Rotas de Planos (/api/v1/plans). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./plan.controller');

const router = Router();

// Admin (gestão de planos) — antes das paramétricas.
router.get('/admin', auth, authorize('settings.view'), controller.adminList);
router.post('/admin', auth, authorize('settings.manage'), controller.adminCreate);
router.put('/admin/:id', auth, authorize('settings.manage'), controller.adminUpdate);
router.delete('/admin/:id', auth, authorize('settings.manage'), controller.adminRemove);

// Catálogo / assinatura.
router.get('/', auth, controller.list);
router.get('/mine', auth, controller.mine);
router.post('/:planId/subscribe', auth, controller.subscribe);

module.exports = router;
