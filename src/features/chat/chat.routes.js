'use strict';

/** Rotas de chat (montadas em /chats). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./chat.controller');

const router = Router();

// Moderação + acesso admin — antes das rotas com '/:id' para evitar colisão.
router.get('/admin/flagged', auth, authorize('chat.view'), controller.listFlagged);
router.get('/admin/all', auth, authorize('chat.view'), controller.listAllAdmin);
router.get('/admin/:id/messages', auth, authorize('chat.view'), controller.getMessagesAdmin);
router.post('/admin/:id/messages', auth, authorize('chat.moderate'), controller.sendMessageAdmin);
router.patch('/messages/:id/moderate', auth, authorize('chat.moderate'), controller.moderateMessage);

// Conversas do usuário corrente.
router.post('/', auth, controller.getOrCreate);
router.get('/', auth, controller.listForUser);

// Mensagens e ações dentro de um chat.
router.get('/:id/messages', auth, controller.getMessages);
router.post('/:id/messages', auth, controller.sendMessage);
router.post('/:id/close', auth, controller.closeChat);

module.exports = router;
