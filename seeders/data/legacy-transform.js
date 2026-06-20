'use strict';

/**
 * Transforma o dump da API antiga (old-api-dump.json, gerado por crawl-old-api.js)
 * nas linhas das tabelas `categories` e `field_definitions` da API nova.
 * É a taxonomia COMPLETA do front antigo: 2068 categorias em 4 níveis, com
 * especificações tipadas e pools de opções reais — exatamente como o front esperava.
 */

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const DUMP = JSON.parse(fs.readFileSync(path.join(__dirname, 'old-api-dump.json'), 'utf8'));

// old fieldType -> enum field_definitions (text|number|boolean|select|multiselect|date|range)
const TYPE_MAP = {
  select: 'select',
  'multi-select': 'multiselect',
  multiselect: 'multiselect',
  boolean: 'boolean',
  text: 'text',
  text_with_unit: 'text',
  autocomplete: 'select',
  number: 'number',
};

/** UUID determinístico a partir do id inteiro legado (idempotente, FK trivial). */
function legacyUuid(id) {
  return `c0000000-0000-4000-8000-${String(id).padStart(12, '0')}`;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Linhas para `categories` — ordenadas por nível para satisfazer a FK parent_id. */
function buildCategories(now) {
  const cats = [...DUMP.categories].sort((a, b) => (a.level - b.level) || (a.sortOrder - b.sortOrder));
  const usedSlugs = new Set();
  return cats.map((c) => {
    let slug = (c.slug && slugify(c.slug)) || slugify(c.name) || `cat-${c.id}`;
    if (usedSlugs.has(slug)) slug = `${slug}-${c.id}`;
    usedSlugs.add(slug);
    return {
      id: legacyUuid(c.id),
      name: c.name,
      slug: slug.slice(0, 140),
      parent_id: c.parentId != null ? legacyUuid(c.parentId) : null,
      description: c.description || null,
      monetization_model: 'commission',
      requires_geolocation: false,
      allows_highlight: true,
      allows_shipping: true,
      icon: c.icon || null,
      sort_order: c.sortOrder || 0,
      is_active: c.isActive !== false,
      created_at: now,
      updated_at: now,
    };
  });
}

/** Linhas para `field_definitions` — campos tipados + pools de opções reais. */
function buildFieldDefinitions(now) {
  const rows = [];
  for (const [catId, fields] of Object.entries(DUMP.fieldDefs || {})) {
    const categoryId = legacyUuid(catId);
    const pools = (DUMP.options && DUMP.options[catId]) || {};
    const seen = new Set();
    let order = 0;
    for (const f of fields) {
      const name = String(f.fieldName || '').slice(0, 80);
      if (!name || seen.has(name)) continue;
      seen.add(name);

      const fieldType = TYPE_MAP[f.fieldType] || 'text';
      // Opções: pool real da categoria > opções inline do campo.
      let options = null;
      if (Array.isArray(pools[f.fieldName]) && pools[f.fieldName].length) options = pools[f.fieldName];
      else if (Array.isArray(f.options) && f.options.length) options = f.options;
      // Só faz sentido em select/multiselect.
      if (options && !['select', 'multiselect'].includes(fieldType)) options = null;

      const units = Array.isArray(f.units) ? f.units : f.units ? [f.units] : [];
      const validation = {};
      if (f.maxItems) validation.maxItems = f.maxItems;
      if (f.allowAdd != null) validation.allowAdd = f.allowAdd;
      if (units.length) validation.units = units;
      if (f.fieldType === 'autocomplete' || f.fieldType === 'text_with_unit') validation.widget = f.fieldType;

      rows.push({
        id: randomUUID(),
        category_id: categoryId,
        name,
        label: String(f.fieldLabel || f.fieldName).slice(0, 120),
        field_type: fieldType,
        options: options ? JSON.stringify(options) : null,
        validation: Object.keys(validation).length ? JSON.stringify(validation) : null,
        unit: units.length ? String(units[0]).slice(0, 20) : null,
        placeholder: null,
        help_text: f.tooltip ? String(f.tooltip).slice(0, 255) : null,
        is_required: !!f.isRequired,
        is_filterable: false,
        is_searchable: false,
        sort_order: f.displayOrder != null ? f.displayOrder : order++,
        is_active: f.isActive !== false,
        created_at: now,
        updated_at: now,
      });
    }
  }
  return rows;
}

module.exports = { buildCategories, buildFieldDefinitions, legacyUuid, slugify };
