'use strict';

/**
 * Padrões dos pacotes de destaque (regras/3): Prata R$7,99 / Ouro R$14,99 /
 * Diamante R$21,99. Vigência (duration_days) é um default editável.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      { tier: 'silver', name: 'Prata', price: 7.99, duration_days: 7, sort_order: 1 },
      { tier: 'gold', name: 'Ouro', price: 14.99, duration_days: 15, sort_order: 2 },
      { tier: 'diamond', name: 'Diamante', price: 21.99, duration_days: 30, sort_order: 3 },
    ];

    await queryInterface.bulkInsert(
      'highlight_packages',
      rows.map((r) => ({
        id: randomUUID(),
        tier: r.tier,
        name: r.name,
        price: r.price,
        currency: 'BRL',
        duration_days: r.duration_days,
        sort_order: r.sort_order,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('highlight_packages', {
      tier: { [Sequelize.Op.in]: ['silver', 'gold', 'diamond'] },
    });
  },
};
