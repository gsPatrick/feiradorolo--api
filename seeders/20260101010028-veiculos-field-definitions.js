'use strict';

/**
 * Campos (field_definitions) da vertical VEÍCULOS. Adiciona à categoria `veiculos`
 * para que o formulário de anúncio e a busca por specs (`?spec_<chave>=`) funcionem.
 *
 * Idempotente: ON CONFLICT (category_id, name) atualiza o registro existente.
 */
const { randomUUID } = require('crypto');

const TARGET_SLUGS = ['veiculos'];

const TIPOS_VEICULO = [
  'Carro', 'Moto', 'Caminhão', 'Ônibus', 'Van/Utilitário', 'Barco/Aeronave',
];

const CARROCERIAS = [
  'SUV', 'Hatch', 'Sedã', 'Picape', 'Cupê', 'Conversível', 'Crossover',
  'Híbrido', 'Elétrico',
];

const MARCAS = [
  'Chevrolet', 'Volkswagen', 'Fiat', 'Ford', 'Toyota', 'Honda', 'Hyundai',
  'Renault', 'Jeep', 'Nissan', 'Peugeot', 'Citroën', 'BMW', 'Mercedes-Benz',
  'Audi', 'BYD', 'GWM', 'Mitsubishi', 'Kia', 'Volvo',
];

const ANOS = (() => {
  const out = [];
  for (let y = 2026; y >= 1990; y -= 1) out.push(String(y));
  return out;
})();

const COMBUSTIVEIS = ['Flex', 'Gasolina', 'Etanol', 'Diesel', 'Elétrico', 'Híbrido', 'GNV'];
const CAMBIOS = ['Manual', 'Automático', 'Automatizado', 'CVT'];
const CORES = ['Preto', 'Branco', 'Prata', 'Cinza', 'Vermelho', 'Azul', 'Outra'];
const CONDICOES = ['Novo', 'Usado', 'Seminovo'];

// name, label, field_type, options(array|null), unit, is_required, sort_order
const FIELDS = [
  ['tipo_veiculo', 'Tipo', 'select', TIPOS_VEICULO, null, true, 1],
  ['carroceria', 'Carroceria', 'select', CARROCERIAS, null, false, 2],
  ['marca', 'Marca', 'select', MARCAS, null, true, 3],
  ['modelo', 'Modelo', 'text', null, null, true, 4],
  ['ano', 'Ano', 'select', ANOS, null, true, 5],
  ['km', 'Quilometragem', 'number', null, 'km', false, 6],
  ['combustivel', 'Combustível', 'select', COMBUSTIVEIS, null, false, 7],
  ['cambio', 'Câmbio', 'select', CAMBIOS, null, false, 8],
  ['cor', 'Cor', 'select', CORES, null, false, 9],
  ['condicao', 'Condição', 'select', CONDICOES, null, true, 10],
  ['portas', 'Portas', 'select', ['2', '4'], null, false, 11],
  ['final_placa', 'Final da placa', 'text', null, null, false, 12],
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
