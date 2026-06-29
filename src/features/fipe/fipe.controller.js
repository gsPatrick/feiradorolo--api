'use strict';

/** Controller FIPE — consulta pública da tabela de preços de veículos. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk } = require('../../utils/apiResponse');
const service = require('./fipe.service');

// GET /fipe/marcas?tipo=carros
const marcas = catchAsync(async (req, res) => {
  const data = await service.getMarcas(req.query.tipo);
  return sendOk(res, data);
});

// GET /fipe/modelos?tipo=&marca=
const modelos = catchAsync(async (req, res) => {
  const data = await service.getModelos(req.query.tipo, req.query.marca);
  return sendOk(res, data);
});

// GET /fipe/anos?tipo=&marca=&modelo=
const anos = catchAsync(async (req, res) => {
  const data = await service.getAnos(req.query.tipo, req.query.marca, req.query.modelo);
  return sendOk(res, data);
});

// GET /fipe/valor?tipo=&marca=&modelo=&ano=
const valor = catchAsync(async (req, res) => {
  const data = await service.getValor(req.query.tipo, req.query.marca, req.query.modelo, req.query.ano);
  return sendOk(res, data);
});

module.exports = { marcas, modelos, anos, valor };
