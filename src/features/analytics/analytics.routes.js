'use strict';

/** Métricas admin. Montado em /analytics sob /api/v1. */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./analytics.controller');

const router = Router();

router.get('/overview', auth, authorize('analytics.view'), controller.overview); // ?period=7|30|90
router.get('/system', auth, authorize('analytics.view'), controller.systemHealth);
router.get('/dashboard', auth, authorize('analytics.view'), controller.dashboard);

module.exports = router;
