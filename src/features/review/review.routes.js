'use strict';

/**
 * Rotas de Avaliações. Listagem por produto é pública; "minhas" e criação exigem
 * sessão. Montado em /reviews sob /api/v1.
 */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./review.controller');

const router = Router();

router.get('/mine', auth, controller.listMine);
router.get('/can-review', auth, controller.canReview); // ?product_id=
router.get('/', controller.list); // ?product_id=
router.post('/', auth, controller.create);

module.exports = router;
