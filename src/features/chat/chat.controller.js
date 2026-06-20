'use strict';

/** Controller de chat — orquestra requisições HTTP e o chat.service. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const chatService = require('./chat.service');

const getOrCreate = catchAsync(async (req, res) => {
  const { sellerId, productId, orderId } = req.body;
  const chat = await chatService.getOrCreate({
    buyerId: req.user.id,
    sellerId,
    productId,
    orderId,
  });
  return sendCreated(res, chat, 'Chat pronto.');
});

const listForUser = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { rows, total } = await chatService.listForUser(req.user.id, { page, limit });
  return paginated(res, rows, { page, limit, total });
});

const getMessages = catchAsync(async (req, res) => {
  const { page = 1, limit = 30 } = req.query;
  const { rows, total } = await chatService.getMessages(req.params.id, req.user.id, { page, limit });
  return paginated(res, rows, { page, limit, total });
});

const sendMessage = catchAsync(async (req, res) => {
  const { content, type, attachments } = req.body;
  const message = await chatService.sendMessage({
    chatId: req.params.id,
    senderId: req.user.id,
    content,
    type,
    attachments,
  });
  return sendCreated(res, message, 'Mensagem enviada.');
});

const closeChat = catchAsync(async (req, res) => {
  const chat = await chatService.closeChat(req.params.id, req.user.id);
  return sendOk(res, chat, 'Chat encerrado.');
});

const listFlagged = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { rows, total } = await chatService.listFlagged({ page, limit });
  return paginated(res, rows, { page, limit, total });
});

const moderateMessage = catchAsync(async (req, res) => {
  const message = await chatService.moderateMessage(req.params.id, req.body);
  return sendOk(res, message, 'Mensagem moderada.');
});

/* ===== Admin: acesso completo às conversas ===== */
const listAllAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const { rows, total } = await chatService.listAll({ page, limit, search });
  return paginated(res, rows, { page, limit, total });
});

const getMessagesAdmin = catchAsync(async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const { rows, total } = await chatService.getMessages(req.params.id, req.user.id, { page, limit, asAdmin: true });
  return paginated(res, rows, { page, limit, total });
});

const sendMessageAdmin = catchAsync(async (req, res) => {
  const { content, type, attachments } = req.body;
  const message = await chatService.sendMessage({
    chatId: req.params.id,
    senderId: req.user.id,
    content,
    type,
    attachments,
    asAdmin: true,
  });
  return sendCreated(res, message, 'Mensagem enviada.');
});

module.exports = {
  getOrCreate,
  listForUser,
  getMessages,
  sendMessage,
  closeChat,
  listFlagged,
  moderateMessage,
  listAllAdmin,
  getMessagesAdmin,
  sendMessageAdmin,
};
