'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('message_templates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      key: { type: Sequelize.STRING(120), allowNull: false },
      channel: { type: Sequelize.ENUM('email', 'push', 'in_app', 'sms'), allowNull: false },
      locale: { type: Sequelize.STRING(5), allowNull: false, defaultValue: 'pt-BR' },
      name: { type: Sequelize.STRING(120), allowNull: false },
      subject: { type: Sequelize.STRING(200) },
      title: { type: Sequelize.STRING(180) },
      body: { type: Sequelize.TEXT, allowNull: false },
      variables: { type: Sequelize.JSONB },
      provider: { type: Sequelize.ENUM('brevo', 'zoho', 'fcm', 'onesignal', 'internal') },
      is_transactional: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('message_templates', ['key', 'channel', 'locale'], { unique: true, name: 'message_templates_key_channel_locale_unique' });
    await queryInterface.addIndex('message_templates', ['channel']);
    await queryInterface.addIndex('message_templates', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('message_templates');
  },
};
