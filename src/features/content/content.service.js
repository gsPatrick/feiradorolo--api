'use strict';

/** Serviço de páginas de conteúdo (institucionais). Leitura pública + admin upsert. */
const db = require('../../models');
const AppError = require('../../utils/AppError');

/** Lista enxuta das páginas publicadas (para menus/índices). */
async function listPublic() {
  return db.ContentPage.findAll({
    where: { is_published: true },
    attributes: ['slug', 'title', 'subtitle', 'icon', 'kind', 'sort_order'],
    order: [['sort_order', 'ASC'], ['title', 'ASC']],
  });
}

/** Página completa por slug (pública, apenas publicadas). */
async function getBySlug(slug) {
  const page = await db.ContentPage.findOne({ where: { slug, is_published: true } });
  if (!page) throw AppError.notFound('Página não encontrada.', 'CONTENT_PAGE_NOT_FOUND');
  return page;
}

/* ----------------------------- admin ----------------------------- */
async function listAll() {
  return db.ContentPage.findAll({ order: [['sort_order', 'ASC'], ['title', 'ASC']] });
}

/** Cria ou atualiza pela slug (upsert) — conveniente para o painel. */
async function upsert(slug, data, userId) {
  const payload = { ...data, slug, updated_by: userId || null };
  const existing = await db.ContentPage.findOne({ where: { slug } });
  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return db.ContentPage.create(payload);
}

async function remove(slug) {
  const page = await db.ContentPage.findOne({ where: { slug } });
  if (!page) throw AppError.notFound('Página não encontrada.', 'CONTENT_PAGE_NOT_FOUND');
  await page.destroy();
}

module.exports = { listPublic, getBySlug, listAll, upsert, remove };
