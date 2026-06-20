'use strict';

/** Cupons. Público lista/valida; admin gerencia. Montado em /coupons. */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./coupon.controller');

const router = Router();

// Admin (antes de '/:id').
router.get('/all', auth, authorize('settings.view'), controller.listAll);
router.post('/', auth, authorize('settings.manage'), controller.create);
router.put('/:id', auth, authorize('settings.manage'), controller.update);
router.delete('/:id', auth, authorize('settings.manage'), controller.remove);

// Público / usuário.
router.get('/', controller.listActive);
router.post('/validate', auth, controller.validate);

module.exports = router;
