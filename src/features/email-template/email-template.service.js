'use strict';

/** CRUD de templates de e-mail (model MessageTemplate, channel='email'). */
const db = require('../../models');
const AppError = require('../../utils/AppError');

const FIELDS = ['key', 'name', 'subject', 'body', 'locale', 'variables', 'provider', 'is_transactional', 'is_active'];

async function list() {
  return db.MessageTemplate.findAll({
    where: { channel: 'email' },
    order: [['name', 'ASC']],
  });
}

async function create(data = {}, userId) {
  if (!data.key) throw AppError.unprocessable('key é obrigatório.', 'TEMPLATE_KEY_REQUIRED');
  if (!data.name) throw AppError.unprocessable('name é obrigatório.', 'TEMPLATE_NAME_REQUIRED');
  const payload = { channel: 'email', locale: data.locale || 'pt-BR', updated_by: userId || null };
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) payload[f] = data[f];
  });
  return db.MessageTemplate.create(payload);
}

async function update(id, data = {}, userId) {
  const tpl = await db.MessageTemplate.findByPk(id);
  if (!tpl) throw AppError.notFound('Template não encontrado.', 'TEMPLATE_NOT_FOUND');
  const updates = { updated_by: userId || null };
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) updates[f] = data[f];
  });
  await tpl.update(updates);
  return tpl;
}

async function remove(id) {
  const tpl = await db.MessageTemplate.findByPk(id);
  if (!tpl) throw AppError.notFound('Template não encontrado.', 'TEMPLATE_NOT_FOUND');
  await tpl.destroy();
}

module.exports = { list, create, update, remove };
