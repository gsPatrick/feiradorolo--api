'use strict';

/**
 * Serviço de Categorias e Especificações (field_definitions).
 * Regras de monetização vivem em `monetization_model`; as especificações
 * dinâmicas (field_definitions) definem os campos de products.specifications.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');

const MONETIZATION_MODELS = ['commission', 'package', 'free', 'free_geo'];
const FIELD_TYPES = ['text', 'number', 'boolean', 'select', 'multiselect', 'date', 'range'];

/** Gera slug: minúsculas, sem acentos, não-alfanumérico vira '-', sufixo aleatório. */
function slugify(text) {
  const base = String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `${base || 'cat'}-${suffix}`;
}

/** Árvore de categorias ativas (parent_id -> children). Uma query, monta em memória. */
async function tree() {
  const rows = await db.Category.findAll({
    where: { is_active: true },
    order: [
      ['sort_order', 'ASC'],
      ['name', 'ASC'],
    ],
  });
  const nodes = rows.map((r) => {
    const json = r.toJSON();
    json.children = [];
    return json;
  });
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const node of nodes) {
    if (node.parent_id && byId.has(node.parent_id)) {
      byId.get(node.parent_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

/** Lista plana, ordenada por sort_order. */
async function list() {
  return db.Category.findAll({
    order: [
      ['sort_order', 'ASC'],
      ['name', 'ASC'],
    ],
  });
}

function includeFull() {
  return [
    {
      model: db.FieldDefinition,
      as: 'fields',
      separate: true,
      order: [['sort_order', 'ASC']],
    },
    {
      model: db.Category,
      as: 'children',
      separate: true,
      order: [['sort_order', 'ASC']],
    },
  ];
}

async function getBySlug(slug) {
  const category = await db.Category.findOne({ where: { slug }, include: includeFull() });
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  return category;
}

async function getById(id) {
  const category = await db.Category.findByPk(id, { include: includeFull() });
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  return category;
}

function validateMonetization(model) {
  if (model !== undefined && model !== null && !MONETIZATION_MODELS.includes(model)) {
    throw AppError.unprocessable(
      `monetization_model inválido. Valores: ${MONETIZATION_MODELS.join(', ')}.`,
      'INVALID_MONETIZATION_MODEL'
    );
  }
}

async function ensureUniqueSlug(slug, excludeId = null) {
  const where = { slug };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await db.Category.findOne({ where });
  if (existing) throw AppError.conflict('Já existe uma categoria com este slug.', 'CATEGORY_SLUG_TAKEN');
}

async function create(data = {}) {
  if (!data.name) throw AppError.unprocessable('name é obrigatório.', 'CATEGORY_NAME_REQUIRED');
  validateMonetization(data.monetization_model);

  const slug = data.slug ? slugify(data.slug) : slugify(data.name);
  await ensureUniqueSlug(slug);

  return db.Category.create({
    name: data.name,
    slug,
    parent_id: data.parent_id || null,
    description: data.description || null,
    monetization_model: data.monetization_model || 'commission',
    requires_geolocation: data.requires_geolocation === true,
    allows_highlight: data.allows_highlight !== undefined ? data.allows_highlight === true : true,
    allows_shipping: data.allows_shipping !== undefined ? data.allows_shipping === true : true,
    icon: data.icon || null,
    image_url: data.image_url || null,
    sort_order: data.sort_order != null ? Number(data.sort_order) : 0,
    is_active: data.is_active !== undefined ? data.is_active === true : true,
    metadata: data.metadata || null,
  });
}

async function update(id, data = {}) {
  const category = await db.Category.findByPk(id);
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  validateMonetization(data.monetization_model);

  const patch = {};
  const fields = [
    'name',
    'parent_id',
    'description',
    'monetization_model',
    'requires_geolocation',
    'allows_highlight',
    'allows_shipping',
    'icon',
    'image_url',
    'sort_order',
    'is_active',
    'metadata',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) patch[f] = data[f];
  }

  if (data.slug !== undefined && data.slug !== null) {
    const slug = slugify(data.slug);
    await ensureUniqueSlug(slug, id);
    patch.slug = slug;
  }

  await category.update(patch);
  return category;
}

/** Soft delete: marca is_active=false. */
async function remove(id) {
  const category = await db.Category.findByPk(id);
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  await category.update({ is_active: false });
  return category;
}

/* ------------------------------ field_definitions ------------------------- */

function validateFieldType(type) {
  if (type !== undefined && type !== null && !FIELD_TYPES.includes(type)) {
    throw AppError.unprocessable(
      `field_type inválido. Valores: ${FIELD_TYPES.join(', ')}.`,
      'INVALID_FIELD_TYPE'
    );
  }
}

async function ensureUniqueFieldName(categoryId, name, excludeId = null) {
  const where = { category_id: categoryId, name };
  if (excludeId) where.id = { [Op.ne]: excludeId };
  const existing = await db.FieldDefinition.findOne({ where });
  if (existing) {
    throw AppError.conflict('Já existe um campo com este nome nesta categoria.', 'FIELD_NAME_TAKEN');
  }
}

async function listFields(categoryId) {
  const category = await db.Category.findByPk(categoryId);
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  return db.FieldDefinition.findAll({
    where: { category_id: categoryId },
    order: [['sort_order', 'ASC']],
  });
}

async function addField(categoryId, data = {}) {
  const category = await db.Category.findByPk(categoryId);
  if (!category) throw AppError.notFound('Categoria não encontrada.', 'CATEGORY_NOT_FOUND');
  if (!data.name) throw AppError.unprocessable('name é obrigatório.', 'FIELD_NAME_REQUIRED');
  if (!data.label) throw AppError.unprocessable('label é obrigatório.', 'FIELD_LABEL_REQUIRED');
  validateFieldType(data.field_type);
  await ensureUniqueFieldName(categoryId, data.name);

  return db.FieldDefinition.create({
    category_id: categoryId,
    name: data.name,
    label: data.label,
    field_type: data.field_type || 'text',
    options: data.options || null,
    validation: data.validation || null,
    unit: data.unit || null,
    placeholder: data.placeholder || null,
    help_text: data.help_text || null,
    is_required: data.is_required === true,
    is_filterable: data.is_filterable === true,
    is_searchable: data.is_searchable === true,
    sort_order: data.sort_order != null ? Number(data.sort_order) : 0,
    is_active: data.is_active !== undefined ? data.is_active === true : true,
  });
}

async function updateField(fieldId, data = {}) {
  const field = await db.FieldDefinition.findByPk(fieldId);
  if (!field) throw AppError.notFound('Campo não encontrado.', 'FIELD_NOT_FOUND');
  validateFieldType(data.field_type);

  if (data.name !== undefined && data.name !== field.name) {
    await ensureUniqueFieldName(field.category_id, data.name, fieldId);
  }

  const patch = {};
  const fields = [
    'name',
    'label',
    'field_type',
    'options',
    'validation',
    'unit',
    'placeholder',
    'help_text',
    'is_required',
    'is_filterable',
    'is_searchable',
    'sort_order',
    'is_active',
  ];
  for (const f of fields) {
    if (data[f] !== undefined) patch[f] = data[f];
  }

  await field.update(patch);
  return field;
}

async function removeField(fieldId) {
  const field = await db.FieldDefinition.findByPk(fieldId);
  if (!field) throw AppError.notFound('Campo não encontrado.', 'FIELD_NOT_FOUND');
  await field.destroy();
  return field;
}

module.exports = {
  slugify,
  tree,
  list,
  getBySlug,
  getById,
  create,
  update,
  remove,
  addField,
  updateField,
  removeField,
  listFields,
};
