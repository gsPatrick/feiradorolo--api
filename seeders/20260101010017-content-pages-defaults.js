'use strict';

/**
 * Páginas de conteúdo institucionais — carrega cada JSON de seeders/data/content/
 * (um por slug, gerado a partir do front antigo) para a tabela content_pages.
 * Assim o front puxa da API (com fallback hardcoded) e o admin pode editar.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const dir = path.join(__dirname, 'data', 'content');
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    if (!files.length) return;

    const now = new Date();
    const rows = files.map((file, i) => {
      const p = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
      return {
        id: randomUUID(),
        slug: p.slug || file.replace(/\.json$/, ''),
        title: p.title || p.slug,
        subtitle: p.subtitle || null,
        kind: p.kind || 'content',
        icon: p.icon || null,
        content: p.content ? JSON.stringify(p.content) : null,
        meta: p.meta ? JSON.stringify(p.meta) : null,
        is_published: p.is_published !== false,
        sort_order: p.sort_order != null ? p.sort_order : i,
        updated_by: null,
        created_at: now,
        updated_at: now,
      };
    });

    await queryInterface.bulkInsert('content_pages', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('content_pages', null, {});
  },
};
