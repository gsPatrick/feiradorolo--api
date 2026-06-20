'use strict';

/**
 * Configurações de aplicação que ANTES viviam no .env e agora são gerenciadas
 * pelo admin no banco (URLs públicas, CORS, remetente de e-mail, expiração de
 * token). Só permanecem no .env os segredos-raiz (DATABASE_URL, JWT_SECRET,
 * APP_ENCRYPTION_KEY) e o bootstrap de processo (PORT, NODE_ENV).
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      { key: 'app.public_url', value: '', group: 'general', value_type: 'string', label: 'URL pública da API (webhooks/callbacks)', is_public: false },
      { key: 'app.web_url', value: '', group: 'general', value_type: 'string', label: 'URL do frontend (redirects/back_urls)', is_public: true },
      { key: 'app.cors_origins', value: ['*'], group: 'general', value_type: 'json', label: 'Origens permitidas (CORS)', is_public: false },
      { key: 'app.name', value: 'Feira do Rolo', group: 'general', value_type: 'string', label: 'Nome da plataforma', is_public: true },
      { key: 'mail.from_email', value: 'no-reply@feiradorolo.com', group: 'general', value_type: 'string', label: 'E-mail remetente padrão' },
      { key: 'mail.from_name', value: 'Feira do Rolo', group: 'general', value_type: 'string', label: 'Nome do remetente padrão' },
      { key: 'auth.jwt_expires_in', value: '7d', group: 'security', value_type: 'string', label: 'Validade do token de sessão (ex.: 7d, 12h)' },
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
        is_public: !!r.is_public,
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
      key: { [Sequelize.Op.in]: ['app.public_url', 'app.web_url', 'app.cors_origins', 'app.name', 'mail.from_email', 'mail.from_name', 'auth.jwt_expires_in'] },
    });
  },
};
