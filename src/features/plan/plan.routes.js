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

// Admin: conceder/revogar/listar assinaturas (grant, sem pagamento).
// Rotas mais específicas antes de '/admin/:id' já registrada acima não conflitam
// (paths distintos), mas mantemos 'subscriptions' explícito.
router.get('/admin/subscriptions', auth, authorize('settings.view'), controller.adminListSubscriptions);
router.post('/admin/grant', auth, authorize('settings.manage'), controller.adminGrant);
router.delete('/admin/subscriptions/:id', auth, authorize('settings.manage'), controller.adminRevokeSubscription);

// Catálogo / assinatura.
router.get('/', auth, controller.list);
router.get('/mine', auth, controller.mine);
// Re-pagar / (re)gerar Pix de uma assinatura pendente — antes da paramétrica :planId.
router.post('/subscriptions/:id/pay', auth, controller.pay);
router.post('/:planId/subscribe', auth, controller.subscribe);

module.exports = router;
