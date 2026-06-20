'use strict';

/** Rotas de Notificações (/api/v1/notifications). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./notification.controller');

const router = Router();

// Admin: ver todas + enviar/broadcast + limpar (antes das rotas com '/:id').
router.get('/admin', auth, authorize('push.view'), controller.adminList);
router.post('/admin', auth, authorize('push.manage'), controller.adminCreate);
router.delete('/admin/all', auth, authorize('push.manage'), controller.adminClearAll);
router.delete('/admin/:id', auth, authorize('push.manage'), controller.adminDelete);

router.post('/devices', auth, controller.registerDevice);
router.delete('/devices', auth, controller.removeDevice);
router.get('/', auth, controller.list);
router.post('/read-all', auth, controller.markAllRead);
router.patch('/:id/read', auth, controller.markRead);

// Envio de teste (admin com permissão de push).
router.post('/test', auth, authorize('push.manage'), controller.sendTest);

module.exports = router;
