'use strict';

/** Configuração default de frete (Melhor Envio): sem markup, sem frete grátis. */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert('shipping_settings', [
      {
        id: randomUUID(),
        name: 'default',
        provider: 'melhor_envio',
        markup_percent: 0,
        markup_fixed: 0,
        free_shipping_enabled: false,
        free_shipping_min_order: null,
        max_weight_grams: 30000,
        max_declared_value: null,
        is_active: true,
        created_at: now,
        updated_at: now,
      },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('shipping_settings', {
      name: { [Sequelize.Op.in]: ['default'] },
    });
  },
};
