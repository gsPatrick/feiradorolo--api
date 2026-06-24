'use strict';

/**
 * Campos (field_definitions) da vertical IMÓVEIS. Adiciona à categoria `imoveis`
 * (e a eventuais subcategorias: apartamentos/casas/chacaras/terrenos, se existirem)
 * para que o formulário de anúncio e a busca por specs (`?spec_<chave>=`) funcionem.
 *
 * Idempotente: ON CONFLICT (category_id, name) atualiza o registro existente.
 */
const { randomUUID } = require('crypto');

const TARGET_SLUGS = ['imoveis', 'apartamentos', 'casas', 'chacaras', 'terrenos'];

const TIPOS_IMOVEL = [
  'Apartamento', 'Casa', 'Chácara', 'Sítio', 'Fazenda', 'Terreno',
  'Sala Comercial', 'Loja Comercial', 'Galpão', 'Flat/Apart Hotel', 'Outros',
];

// name, label, field_type, options(array|null), unit, is_required, sort_order
const FIELDS = [
  ['operacao', 'Operação', 'select', ['Venda', 'Aluguel', 'Temporada'], null, true, 1],
  ['tipo_imovel', 'Tipo', 'select', TIPOS_IMOVEL, null, true, 2],
  ['quartos', 'Quartos', 'select', ['1', '2', '3', '4', '5', '6+'], null, false, 3],
  ['banheiros', 'Banheiros', 'select', ['1', '2', '3', '4', '5+'], null, false, 4],
  ['vagas', 'Vagas de garagem', 'select', ['0', '1', '2', '3', '4', '5+'], null, false, 5],
  ['area_total', 'Área total (m²)', 'number', null, 'm²', false, 6],
  ['area_util', 'Área útil (m²)', 'number', null, 'm²', false, 7],
  ['condicao', 'Condição', 'select', ['Novo', 'Usado'], null, false, 8],
  ['mobiliado', 'Mobiliado', 'boolean', null, null, false, 9],
  ['aceita_pet', 'Aceita pet', 'boolean', null, null, false, 10],
  ['condominio', 'Condomínio (R$)', 'number', null, 'R$', false, 11],
  ['iptu', 'IPTU (R$)', 'number', null, 'R$', false, 12],
];

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date();

    const [cats] = await seq.query(
      `SELECT id, slug FROM categories WHERE slug IN (:slugs)`,
      { replacements: { slugs: TARGET_SLUGS } }
    );
    if (!cats.length) return;

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
