'use strict';

/** Rotas de Pagamentos (/api/v1/payments). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./payment.controller');

const router = Router();

// Webhook do gateway: SEM auth (o Mercado Pago chama esta rota).
router.post('/webhook', controller.webhook);

// Onboarding do repasse (vínculo OAuth da conta do vendedor).
router.get('/connect/mercado-pago', auth, controller.connect);
router.get('/connect/mercado-pago/callback', controller.connectCallback); // MP redireciona (sem auth)
router.get('/connect/status', auth, controller.connectStatus);
router.delete('/connect/mercado-pago', auth, controller.disconnect);

// Checkout.
router.post('/order/:orderId/preference', auth, controller.createPreference);
router.post('/order/:orderId/pay', auth, controller.createPayment);

router.get('/:id', auth, controller.getById);

module.exports = router;
