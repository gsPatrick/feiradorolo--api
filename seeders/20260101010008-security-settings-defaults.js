'use strict';

/**
 * Políticas de segurança/verificação editáveis pelo admin (antes eram lógica
 * fixa). Inclui os gatilhos da verificação facial obrigatória (regras/3),
 * limites de login, prazo de disputa e moderação de chat. Tudo em
 * platform_settings (grupo security/payment) com default_value e limites.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      { key: 'facial.seller_required_after_first_sale', value: true, group: 'security', value_type: 'boolean', label: 'Exigir verificação facial do vendedor após 1ª venda' },
      { key: 'facial.buyer_required_after_first_purchase', value: true, group: 'security', value_type: 'boolean', label: 'Exigir verificação facial do comprador após 1ª compra' },
      { key: 'facial.min_score', value: 0.8, group: 'security', value_type: 'number', label: 'Score mínimo de verificação facial', min_value: 0, max_value: 1, unit: 'score' },
      { key: 'security.max_login_attempts', value: 5, group: 'security', value_type: 'number', label: 'Tentativas de login antes de bloquear', min_value: 1, max_value: 100, unit: 'tentativas' },
      { key: 'security.lockout_minutes', value: 15, group: 'security', value_type: 'number', label: 'Minutos de bloqueio após exceder tentativas', min_value: 1, max_value: 1440, unit: 'min' },
      { key: 'security.password_min_length', value: 8, group: 'security', value_type: 'number', label: 'Tamanho mínimo de senha', min_value: 6, max_value: 64, unit: 'chars' },
      { key: 'security.chat_moderation_enabled', value: true, group: 'security', value_type: 'boolean', label: 'Moderação automática de chat (blocked_words)' },
      { key: 'dispute.window_days', value: 7, group: 'payment', value_type: 'number', label: 'Prazo para abertura de disputa após entrega', min_value: 0, max_value: 90, unit: 'dias' },
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
          'facial.seller_required_after_first_sale',
          'facial.buyer_required_after_first_purchase',
          'facial.min_score',
          'security.max_login_attempts',
          'security.lockout_minutes',
          'security.password_min_length',
          'security.chat_moderation_enabled',
          'dispute.window_days',
        ],
      },
    });
  },
};
