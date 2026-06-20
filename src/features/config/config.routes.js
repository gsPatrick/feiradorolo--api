'use strict';

/** Rotas públicas de configuração (lidas pelo frontend). Montado em /config. */
const { Router } = require('express');
const controller = require('./config.controller');

const router = Router();

// GET /config/public -> { 'branding.topbar_message': '...', 'social.links': {...}, ... }
router.get('/public', controller.publicSettings);
// GET /config/fees -> { commission_percent, max_installments, free_shipping_enabled, free_shipping_min_order }
router.get('/fees', controller.fees);

module.exports = router;
