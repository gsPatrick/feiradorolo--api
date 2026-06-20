'use strict';

/**
 * Categorias do marketplace — taxonomia COMPLETA capturada da API antiga
 * (old-api-dump.json): 2068 categorias em 4 níveis hierárquicos, com ícones emoji
 * e slugs. As especificações tipadas de cada categoria viram field_definitions
 * (ver 20260101010014-field-definitions-legacy) e fazem o formulário de anúncio
 * mudar conforme a categoria escolhida.
 *
 * Dados: seeders/data/old-api-dump.json (gerado por seeders/data/crawl-old-api.js).
 */
const { buildCategories } = require('./data/legacy-transform');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const categories = buildCategories(now); // raízes antes dos filhos (FK pela ordem)
    await queryInterface.bulkInsert('categories', categories);
  },

  async down(queryInterface) {
    // field_definitions têm FK ON DELETE CASCADE para categories.
    await queryInterface.bulkDelete('categories', null, {});
  },
};
