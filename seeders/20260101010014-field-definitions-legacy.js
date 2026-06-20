'use strict';

/**
 * Especificações por categoria (field_definitions) — capturadas da API antiga
 * (old-api-dump.json). Campos tipados (select/multiselect/boolean/text) com seus
 * pools de opções reais. É o que faz o formulário de "Adicionar Produto" mudar
 * conforme a categoria escolhida (lido em GET /categories/:id/fields).
 *
 * Roda depois de 20260101010002-categories-defaults (as categorias precisam existir).
 * Insere em lotes — são ~14k linhas com JSONB grande (ex.: marca com milhares de opções).
 */
const { buildFieldDefinitions } = require('./data/legacy-transform');

const BATCH = 500;

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = buildFieldDefinitions(now);
    for (let i = 0; i < rows.length; i += BATCH) {
      await queryInterface.bulkInsert('field_definitions', rows.slice(i, i + BATCH));
    }
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('field_definitions', null, {});
  },
};
