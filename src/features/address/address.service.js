'use strict';

/** Agenda de endereços do usuário (CRUD). */
const db = require('../../models');
const AppError = require('../../utils/AppError');

const FIELDS = ['label', 'recipient_name', 'phone', 'zip_code', 'street', 'number', 'complement', 'neighborhood', 'city', 'state', 'country', 'is_default'];

async function listMine(userId) {
  return db.Address.findAll({ where: { user_id: userId }, order: [['is_default', 'DESC'], ['created_at', 'DESC']] });
}

async function clearDefault(userId, exceptId, transaction) {
  await db.Address.update(
    { is_default: false },
    { where: { user_id: userId, ...(exceptId ? { id: { [db.Sequelize.Op.ne]: exceptId } } : {}) }, transaction }
  );
}

async function create(userId, data = {}) {
  if (!data.zip_code || !data.street || !data.city || !data.state) {
    throw AppError.unprocessable('CEP, rua, cidade e UF são obrigatórios.', 'ADDRESS_INCOMPLETE');
  }
  const count = await db.Address.count({ where: { user_id: userId } });
  const payload = { user_id: userId };
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) payload[f] = data[f];
  });
  if (count === 0) payload.is_default = true; // o primeiro vira padrão
  const address = await db.Address.create(payload);
  if (address.is_default) await clearDefault(userId, address.id);
  return address;
}

async function update(userId, id, data = {}) {
  const address = await db.Address.findOne({ where: { id, user_id: userId } });
  if (!address) throw AppError.notFound('Endereço não encontrado.', 'ADDRESS_NOT_FOUND');
  const updates = {};
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) updates[f] = data[f];
  });
  await address.update(updates);
  if (address.is_default) await clearDefault(userId, address.id);
  return address;
}

async function setDefault(userId, id) {
  const address = await db.Address.findOne({ where: { id, user_id: userId } });
  if (!address) throw AppError.notFound('Endereço não encontrado.', 'ADDRESS_NOT_FOUND');
  await clearDefault(userId, id);
  await address.update({ is_default: true });
  return address;
}

async function remove(userId, id) {
  const address = await db.Address.findOne({ where: { id, user_id: userId } });
  if (!address) throw AppError.notFound('Endereço não encontrado.', 'ADDRESS_NOT_FOUND');
  await address.destroy();
}

module.exports = { listMine, create, update, setDefault, remove };
