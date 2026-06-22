'use strict';

/** Rotas de Envios (/api/v1/shipments). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./shipment.controller');

const router = Router();

// Cotação de frete é pública (a página do produto calcula sem login).
router.post('/quote', controller.quote);
// Transportadoras do Melhor Envio (para o formulário de anúncio escolher).
router.get('/carriers', controller.carriers);
// Apenas o vendedor do pedido (checado no service) pode criar o envio.
router.post('/order/:orderId', auth, controller.createForOrder);
router.post('/:id/label', auth, controller.generateLabel);
router.get('/:id/track', auth, controller.track);

module.exports = router;
