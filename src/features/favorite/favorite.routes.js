'use strict';

/** Rotas de Favoritos (todas exigem sessão). Montado em /favorites. */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./favorite.controller');

const router = Router();
router.use(auth);

router.get('/', controller.listMine);
router.get('/ids', controller.idsMine);
router.post('/:productId', controller.add);
router.delete('/:productId', controller.remove);

module.exports = router;
