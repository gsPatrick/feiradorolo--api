'use strict';

/**
 * Campos de medida da vertical PNEUS (referência: PneuFree.com — busca por
 * medida largura/perfil/aro e por marca). Adiciona field_definitions às
 * categorias de pneus (pneus-automoveis e, quando existirem, motocicleta e
 * caminhões) para que o formulário de anúncio e a busca por medida funcionem.
 *
 * Idempotente: ON CONFLICT (category_id, name) atualiza o registro existente.
 */
const { randomUUID } = require('crypto');

const TARGET_SLUGS = ['pneus-automoveis', 'pneus-motocicleta', 'pneus-caminhoes'];

const MARCAS = [
  'Michelin', 'Pirelli', 'Goodyear', 'Bridgestone', 'Continental', 'Firestone',
  'Dunlop', 'BFGoodrich', 'Cooper', 'General Tire', 'Hankook', 'Yokohama',
  'Kumho', 'Maxxis', 'Linglong', 'Xbri', 'RoadX', 'Barum', 'BKT',
];

// name, label, field_type, options(array|null), unit, is_required, sort_order
const FIELDS = [
  ['largura', 'Largura (mm)', 'select', [165, 175, 185, 195, 205, 215, 225, 235, 245, 255, 265, 275, 285, 295, 305, 315].map(String), 'mm', true, 1],
  ['perfil', 'Perfil / Altura (%)', 'select', [30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80].map(String), '%', true, 2],
  ['aro', 'Aro (polegadas)', 'select', [13, 14, 15, 16, 17, 18, 19, 20, 21, 22].map(String), '"', true, 3],
  ['marca', 'Marca', 'select', MARCAS, null, true, 4],
  ['indice_carga', 'Índice de carga', 'text', null, null, false, 5],
  ['indice_velocidade', 'Índice de velocidade', 'text', null, null, false, 6],
  ['runflat', 'Run Flat', 'boolean', null, null, false, 7],
];

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date();

    const [cats] = await seq.query(
      `SELECT id, slug FROM categories WHERE slug IN (:slugs)`,
      { replacements: { slugs: TARGET_SLUGS } }
    );

    for (const cat of cats) {
      for (const f of FIELDS) {
        const [name, label, fieldType, options, unit, isRequired, sortOrder] = f;
        await seq.query(
          `INSERT INTO field_definitions
             (id, category_id, name, label, field_type, options, unit,
              is_required, is_filterable, is_searchable, sort_order, is_active,
              created_at, updated_at)
           VALUES
             (:id, :cid, :name, :label, :ftype, :options, :unit,
              :req, true, true, :sort, true, :now, :now)
           ON CONFLICT (category_id, name) DO UPDATE SET
             label = EXCLUDED.label,
             field_type = EXCLUDED.field_type,
             options = EXCLUDED.options,
             unit = EXCLUDED.unit,
             is_required = EXCLUDED.is_required,
             is_filterable = EXCLUDED.is_filterable,
             is_searchable = EXCLUDED.is_searchable,
             sort_order = EXCLUDED.sort_order,
             is_active = true,
             updated_at = EXCLUDED.updated_at`,
          {
            replacements: {
              id: randomUUID(),
              cid: cat.id,
              name,
              label,
              ftype: fieldType,
              options: options ? JSON.stringify(options) : null,
              unit,
              req: isRequired,
              sort: sortOrder,
              now,
            },
          }
        );
      }
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    const names = FIELDS.map((f) => f[0]);
    await seq.query(
      `DELETE FROM field_definitions
         WHERE name IN (:names)
           AND category_id IN (SELECT id FROM categories WHERE slug IN (:slugs))`,
      { replacements: { names, slugs: TARGET_SLUGS } }
    );
  },
};
