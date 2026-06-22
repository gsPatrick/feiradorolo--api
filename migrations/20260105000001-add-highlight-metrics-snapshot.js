'use strict';

/**
 * product_highlights — snapshot de métricas no início do impulso.
 * Grava views/favorites/sales do produto quando o destaque é ATIVADO, para
 * calcular o GANHO obtido durante a vigência (results no listHighlights).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('product_highlights', 'views_at_start', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('product_highlights', 'favorites_at_start', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
    await queryInterface.addColumn('product_highlights', 'sales_at_start', {
      type: Sequelize.INTEGER,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('product_highlights', 'sales_at_start');
    await queryInterface.removeColumn('product_highlights', 'favorites_at_start');
    await queryInterface.removeColumn('product_highlights', 'views_at_start');
  },
};
