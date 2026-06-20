'use strict';

/** Controller de autenticação — orquestra requisições HTTP e o auth.service. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated } = require('../../utils/apiResponse');
const authService = require('./auth.service');

const register = catchAsync(async (req, res) => {
  const result = await authService.register(req.body);
  return sendCreated(res, result, 'Cadastro realizado com sucesso.');
});

const login = catchAsync(async (req, res) => {
  const result = await authService.login(req.body);
  return sendOk(res, result, 'Login realizado com sucesso.');
});

const social = catchAsync(async (req, res) => {
  const result = await authService.socialLogin({ idToken: req.body.idToken });
  return sendOk(res, result, 'Login social realizado com sucesso.');
});

const logout = catchAsync(async (req, res) => {
  await authService.logout({ token: req.user.token, decoded: req.user.tokenPayload });
  return sendOk(res, null, 'Sessão encerrada.');
});

const me = catchAsync(async (req, res) => {
  const user = await authService.me(req.user.id);
  return sendOk(res, user);
});

module.exports = { register, login, social, logout, me };
