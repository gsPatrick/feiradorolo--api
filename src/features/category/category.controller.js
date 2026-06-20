'use strict';

/** Controller de Categorias e Especificações. */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent } = require('../../utils/apiResponse');
const service = require('./category.service');

const tree = catchAsync(async (req, res) => {
  const data = await service.tree();
  return sendOk(res, data);
});

const list = catchAsync(async (req, res) => {
  const data = await service.list();
  return sendOk(res, data);
});

const getBySlug = catchAsync(async (req, res) => {
  const data = await service.getBySlug(req.params.slug);
  return sendOk(res, data);
});

const listFields = catchAsync(async (req, res) => {
  const data = await service.listFields(req.params.id);
  return sendOk(res, data);
});

const create = catchAsync(async (req, res) => {
  const data = await service.create(req.body);
  return sendCreated(res, data, 'Categoria criada com sucesso.');
});

const update = catchAsync(async (req, res) => {
  const data = await service.update(req.params.id, req.body);
  return sendOk(res, data, 'Categoria atualizada com sucesso.');
});

const remove = catchAsync(async (req, res) => {
  await service.remove(req.params.id);
  return sendNoContent(res);
});

const addField = catchAsync(async (req, res) => {
  const data = await service.addField(req.params.id, req.body);
  return sendCreated(res, data, 'Campo criado com sucesso.');
});

const updateField = catchAsync(async (req, res) => {
  const data = await service.updateField(req.params.fieldId, req.body);
  return sendOk(res, data, 'Campo atualizado com sucesso.');
});

const removeField = catchAsync(async (req, res) => {
  await service.removeField(req.params.fieldId);
  return sendNoContent(res);
});

module.exports = {
  tree,
  list,
  getBySlug,
  listFields,
  create,
  update,
  remove,
  addField,
  updateField,
  removeField,
};
