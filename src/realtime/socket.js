'use strict';

/**
 * Inicializa o Socket.io: autentica por JWT no handshake, gerencia salas de
 * chat e usuário e persiste mensagens (com moderação) via chat.service.
 */
const { Server } = require('socket.io');
const jwtUtil = require('../utils/jwt');
const db = require('../models');
const logger = require('../utils/logger');
const settings = require('../services/settings.cache');
const { setIo } = require('./io');

function initSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      // Allowlist dinâmica (platform_settings 'app.cors_origins').
      origin: async (origin, cb) => {
        if (!origin) return cb(null, true);
        try {
          const list = await settings.get('app.cors_origins', ['*']);
          const allowed = Array.isArray(list) ? list : [list];
          return cb(null, allowed.includes('*') || allowed.includes(origin));
        } catch (e) {
          return cb(null, true);
        }
      },
      methods: ['GET', 'POST'],
    },
  });

  // Autenticação no handshake.
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('NO_TOKEN'));
      const decoded = jwtUtil.verify(token);
      const user = await db.User.findByPk(decoded.sub || decoded.id);
      if (!user) return next(new Error('USER_NOT_FOUND'));
      // Banidos/suspensos não podem abrir o WebSocket (chat/notificações).
      if (user.account_status === 'banned') return next(new Error('ACCOUNT_BANNED'));
      if (user.account_status === 'suspended') return next(new Error('ACCOUNT_SUSPENDED'));
      socket.user = { id: user.id, name: user.name };
      next();
    } catch (e) {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(`user:${socket.user.id}`);
    logger.debug(`socket conectado: user=${socket.user.id}`);

    socket.on('chat:join', (chatId) => {
      if (chatId) socket.join(`chat:${chatId}`);
    });
    socket.on('chat:leave', (chatId) => {
      if (chatId) socket.leave(`chat:${chatId}`);
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        // Lazy require para evitar dependência circular na carga.
        const chatService = require('../features/chat/chat.service');
        const message = await chatService.sendMessage({
          chatId: payload.chatId,
          senderId: socket.user.id,
          content: payload.content,
          type: payload.type || 'text',
          attachments: payload.attachments || null,
        });
        if (typeof ack === 'function') ack({ success: true, data: message });
      } catch (err) {
        if (typeof ack === 'function') ack({ success: false, error: err.message });
      }
    });

    socket.on('typing', (chatId) => {
      if (chatId) socket.to(`chat:${chatId}`).emit('typing', { userId: socket.user.id });
    });

    socket.on('disconnect', () => {
      logger.debug(`socket desconectado: user=${socket.user.id}`);
    });
  });

  setIo(io);
  return io;
}

module.exports = { initSocket };
