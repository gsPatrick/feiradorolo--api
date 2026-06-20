'use strict';

/** Serviço de Banners (vitrine/marketing). Leitura pública + CRUD admin. */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');

/** Banners ativos e dentro da janela de agendamento (público). */
async function listPublic({ position } = {}) {
  const now = new Date();
  const where = {
    is_active: true,
    [Op.and]: [
      { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
      { [Op.or]: [{ ends_at: null }, { ends_at: { [Op.gte]: now } }] },
    ],
  };
  if (position) where.position = position;
  return db.Banner.findAll({ where, order: [['position', 'ASC'], ['sort_order', 'ASC']] });
}

/** Todos os banners (admin). */
async function listAll() {
  return db.Banner.findAll({ order: [['position', 'ASC'], ['sort_order', 'ASC']] });
}

async function getById(id) {
  const banner = await db.Banner.findByPk(id);
  if (!banner) throw AppError.notFound('Banner não encontrado.', 'BANNER_NOT_FOUND');
  return banner;
}

async function create(data, userId) {
  return db.Banner.create({ ...data, created_by: userId || null });
}

async function update(id, data) {
  const banner = await getById(id);
  await banner.update(data);
  return banner;
}

async function remove(id) {
  const banner = await getById(id);
  await banner.destroy();
}

module.exports = { listPublic, listAll, getById, create, update, remove };
