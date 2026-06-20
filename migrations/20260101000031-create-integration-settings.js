'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('integration_settings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      service: { type: Sequelize.ENUM('brevo', 'zoho', 'firebase', 'melhor_envio', 'fcm', 'onesignal'), allowNull: false },
      environment: { type: Sequelize.ENUM('test', 'production'), allowNull: false, defaultValue: 'production' },
      label: { type: Sequelize.STRING(120) },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      config: { type: Sequelize.JSONB },
      credentials_encrypted: { type: Sequelize.TEXT },
      is_encrypted: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      key_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      rotated_at: { type: Sequelize.DATE },
      updated_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('integration_settings', ['service', 'environment'], { unique: true, name: 'integration_service_env_unique' });
    await queryInterface.addIndex('integration_settings', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('integration_settings');
  },
};
