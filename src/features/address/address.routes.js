'use strict';

/** Agenda de endereços (exige sessão). Montado em /addresses. */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const controller = require('./address.controller');

const router = Router();
router.use(auth);

router.get('/', controller.list);
router.post('/', controller.create);
router.put('/:id', controller.update);
router.post('/:id/default', controller.setDefault);
router.delete('/:id', controller.remove);

module.exports = router;
