'use strict';

/** CRUD de templates de e-mail. Montado em /email-templates sob /api/v1. */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./email-template.controller');

const router = Router();

router.get('/', auth, authorize('emails.view'), controller.list);
router.post('/', auth, authorize('emails.manage'), controller.create);
router.put('/:id', auth, authorize('emails.manage'), controller.update);
router.delete('/:id', auth, authorize('emails.manage'), controller.remove);

module.exports = router;
