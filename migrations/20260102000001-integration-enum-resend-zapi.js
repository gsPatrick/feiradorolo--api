'use strict';
// Adiciona 'resend' (e-mail) e 'zapi' (WhatsApp) ao enum de integration_settings.service.
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query("ALTER TYPE \"enum_integration_settings_service\" ADD VALUE IF NOT EXISTS 'resend'");
    await queryInterface.sequelize.query("ALTER TYPE \"enum_integration_settings_service\" ADD VALUE IF NOT EXISTS 'zapi'");
  },
  async down() { /* enums não removem valores facilmente; no-op */ },
};
