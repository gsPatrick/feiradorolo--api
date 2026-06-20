'use strict';

/** Holder do servidor Socket.io para emissão a partir de services (REST/cron). */
let io = null;

const setIo = (instance) => {
  io = instance;
};
const getIo = () => io;

/** Emite um evento para a sala de um chat (chat:<id>). */
function emitToChat(chatId, event, payload) {
  if (io) io.to(`chat:${chatId}`).emit(event, payload);
}

/** Emite um evento para a sala de um usuário (user:<id>). */
function emitToUser(userId, event, payload) {
  if (io) io.to(`user:${userId}`).emit(event, payload);
}

module.exports = { setIo, getIo, emitToChat, emitToUser };
