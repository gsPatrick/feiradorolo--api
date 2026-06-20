'use strict';

/**
 * Configurações do REPASSE/SPLIT do Mercado Pago — 100% editáveis pelo admin.
 * Nada hardcoded: split ligado/desligado, exigência de vínculo do vendedor,
 * estratégia de retenção do dinheiro, dias de liberação, modo binário,
 * descriptor, opções avançadas (passthrough de qualquer campo que o MP aceite)
 * e parâmetros OAuth.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      { key: 'payment.split_enabled', value: false, value_type: 'boolean', label: 'Habilitar split/repasse nativo (Mercado Pago)' },
      { key: 'payment.require_seller_link', value: false, value_type: 'boolean', label: 'Exigir que o vendedor vincule a conta antes de vender' },
      { key: 'payment.hold_strategy', value: 'platform_escrow', value_type: 'string', label: 'Estratégia de retenção do dinheiro', options: ['platform_escrow', 'mp_capture', 'mp_release_days'] },
      { key: 'payment.money_release_days', value: 0, value_type: 'number', label: 'Dias de liberação do MP (mp_release_days)', min_value: 0, max_value: 60, unit: 'dias' },
      { key: 'payment.binary_mode', value: false, value_type: 'boolean', label: 'Modo binário (aprova/rejeita, sem pendente)' },
      { key: 'payment.statement_descriptor', value: 'FEIRADOROLO', value_type: 'string', label: 'Texto na fatura do comprador' },
      { key: 'payment.gateway_fee_payer', value: 'platform', value_type: 'string', label: 'Quem absorve a taxa do gateway', options: ['platform', 'seller', 'buyer'] },
      { key: 'payment.advanced_options', value: {}, value_type: 'json', label: 'Opções avançadas (passthrough p/ a API do MP)' },
      { key: 'payment.oauth_redirect_uri', value: '', value_type: 'string', label: 'Redirect URI do OAuth (deve casar com o app do MP)' },
      { key: 'payment.oauth_authorization_url', value: 'https://auth.mercadopago.com/authorization', value_type: 'string', label: 'URL de autorização OAuth' },
    ];

    await queryInterface.bulkInsert(
      'platform_settings',
      rows.map((r) => ({
        id: randomUUID(),
        key: r.key,
        value: JSON.stringify(r.value),
        default_value: JSON.stringify(r.value),
        group: 'payment',
        value_type: r.value_type,
        label: r.label,
        unit: r.unit || null,
        min_value: r.min_value ?? null,
        max_value: r.max_value ?? null,
        options: r.options ? JSON.stringify(r.options) : null,
        is_public: false,
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
      key: {
        [Sequelize.Op.in]: [
          'payment.split_enabled', 'payment.require_seller_link', 'payment.hold_strategy',
          'payment.money_release_days', 'payment.binary_mode', 'payment.statement_descriptor',
          'payment.gateway_fee_payer', 'payment.advanced_options', 'payment.oauth_redirect_uri',
          'payment.oauth_authorization_url',
        ],
      },
    });
  },
};
