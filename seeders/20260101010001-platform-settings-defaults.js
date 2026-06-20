'use strict';

/**
 * Bootstrap das configurações GLOBAIS genéricas (engine dinâmica).
 * Comissões -> commission_rules · Destaques -> highlight_packages ·
 * Frete -> shipping_settings · Gateway -> payment_gateway_settings.
 * Aqui ficam apenas globais transversais. `default_value` alimenta o
 * recurso "restaurar padrões".
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      {
        key: 'escrow.hold_days',
        value: 7,
        group: 'payment',
        value_type: 'number',
        label: 'Dias de retenção do escrow (default global)',
        unit: 'dias',
        min_value: 0,
        max_value: 365,
        is_public: false,
      },
      {
        key: 'payment.active_provider',
        value: 'mercado_pago',
        group: 'payment',
        value_type: 'string',
        label: 'Gateway de pagamento ativo',
        is_public: false,
      },
      {
        key: 'general.maintenance_mode',
        value: false,
        group: 'general',
        value_type: 'boolean',
        label: 'Modo manutenção',
        is_public: true,
      },
    ];

    await queryInterface.bulkInsert(
      'platform_settings',
      rows.map((r) => ({
        id: randomUUID(),
        key: r.key,
        value: JSON.stringify(r.value),
        default_value: JSON.stringify(r.value),
        group: r.group,
        value_type: r.value_type,
        label: r.label,
        unit: r.unit || null,
        min_value: r.min_value ?? null,
        max_value: r.max_value ?? null,
        is_public: r.is_public,
        is_editable: true,
        is_sensitive: false,
        is_encrypted: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('platform_settings', {
      key: { [Sequelize.Op.in]: ['escrow.hold_days', 'payment.active_provider', 'general.maintenance_mode'] },
    });
  },
};
