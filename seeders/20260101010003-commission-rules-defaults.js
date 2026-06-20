'use strict';

/**
 * Padrões de comissão (regras/3): 10% standard / 12% premium para produtos
 * gerais. Editáveis pelo admin; o checkout resolve por especificidade/prioridade.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      { name: 'Comissão padrão (geral)', scope: 'seller_tier', seller_tier: 'standard', commission_percent: 10.0, priority: 10 },
      { name: 'Comissão premium (geral)', scope: 'seller_tier', seller_tier: 'premium', commission_percent: 12.0, priority: 20 },
    ];

    await queryInterface.bulkInsert(
      'commission_rules',
      rows.map((r) => ({
        id: randomUUID(),
        name: r.name,
        scope: r.scope,
        category_id: null,
        seller_tier: r.seller_tier,
        commission_percent: r.commission_percent,
        escrow_hold_days: null, // usa default global escrow.hold_days
        priority: r.priority,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('commission_rules', {
      name: { [Sequelize.Op.in]: ['Comissão padrão (geral)', 'Comissão premium (geral)'] },
    });
  },
};
