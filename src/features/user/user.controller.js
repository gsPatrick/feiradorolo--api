'use strict';

/** Controller de usuários — orquestra requisições HTTP e o user.service. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, paginated } = require('../../utils/apiResponse');
const userService = require('./user.service');
const productService = require('../product/product.service');

const list = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, search, status } = req.query;
  const { rows, total } = await userService.list({ page, limit, search, status });
  return paginated(res, rows, { page, limit, total });
});

const getById = catchAsync(async (req, res) => {
  const user = await userService.getById(req.params.id);
  return sendOk(res, user);
});

const sellerProfile = catchAsync(async (req, res) => {
  const profile = await productService.getSellerProfile(req.params.id);
  return sendOk(res, profile);
});

const updateMe = catchAsync(async (req, res) => {
  const user = await userService.updateProfile(req.user.id, req.body);
  return sendOk(res, user, 'Perfil atualizado.');
});

const assignRole = catchAsync(async (req, res) => {
  const userRole = await userService.assignRole(req.params.id, req.body.slug, req.user.id);
  return sendCreated(res, userRole, 'Papel atribuído.');
});

const removeRole = catchAsync(async (req, res) => {
  await userService.removeRole(req.params.id, req.params.slug);
  return sendOk(res, null, 'Papel removido.');
});

const ban = catchAsync(async (req, res) => {
  const record = await userService.ban(req.params.id, req.body, req.user.id);
  return sendCreated(res, record, 'Usuário banido.');
});

const unban = catchAsync(async (req, res) => {
  const user = await userService.unban(req.params.id);
  return sendOk(res, user, 'Banimento revogado.');
});

const approve = catchAsync(async (req, res) => {
  const user = await userService.approve(req.params.id);
  return sendOk(res, user, 'Conta aprovada.');
});

const suspend = catchAsync(async (req, res) => {
  const user = await userService.suspend(req.params.id, req.body, req.user.id);
  return sendOk(res, user, 'Conta suspensa.');
});

const chatOnly = catchAsync(async (req, res) => {
  const user = await userService.setChatOnly(req.params.id, true);
  return sendOk(res, user, 'Restrição "apenas chat" aplicada.');
});

const chatOnlyRemove = catchAsync(async (req, res) => {
  const user = await userService.setChatOnly(req.params.id, false);
  return sendOk(res, user, 'Restrição "apenas chat" removida.');
});

const remove = catchAsync(async (req, res) => {
  const user = await userService.softDelete(req.params.id, req.user.id);
  return sendOk(res, user, 'Conta excluída.');
});

const validateDocument = catchAsync(async (req, res) => {
  const result = await userService.validateSellerDocument(req.user.id);
  return sendOk(res, result, 'Documento validado.');
});

const submitVerification = catchAsync(async (req, res) => {
  const record = await userService.submitVerification(req.user.id, req.body);
  return sendCreated(res, record, 'Verificação enviada.');
});

const myVerifications = catchAsync(async (req, res) => {
  const records = await userService.myVerifications(req.user.id);
  return sendOk(res, records);
});

const reviewVerification = catchAsync(async (req, res) => {
  const record = await userService.reviewVerification(req.params.id, req.body, req.user.id);
  return sendOk(res, record, 'Verificação revisada.');
});

module.exports = {
  list,
  getById,
  sellerProfile,
  updateMe,
  assignRole,
  removeRole,
  ban,
  unban,
  approve,
  suspend,
  chatOnly,
  chatOnlyRemove,
  remove,
  validateDocument,
  submitVerification,
  myVerifications,
  reviewVerification,
};
