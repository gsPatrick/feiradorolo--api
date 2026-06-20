'use strict';

/** Rotas de Planos (/api/v1/plans). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./plan.controller');

const router = Router();

// Rotas estáticas antes das paramétricas.
router.get('/', auth, controller.list);
router.get('/mine', auth, controller.mine);
router.post('/:planId/subscribe', auth, controller.subscribe);

module.exports = router;
