'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payment_gateway_settings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      provider: { type: Sequelize.ENUM('mercado_pago'), allowNull: false, defaultValue: 'mercado_pago' },
      environment: { type: Sequelize.ENUM('test', 'production'), allowNull: false, defaultValue: 'test' },
      label: { type: Sequelize.STRING(120) },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      public_key: { type: Sequelize.STRING },
      access_token_encrypted: { type: Sequelize.TEXT },
      client_id: { type: Sequelize.STRING },
      client_secret_encrypted: { type: Sequelize.TEXT },
      webhook_secret_encrypted: { type: Sequelize.TEXT },
      extra_encrypted: { type: Sequelize.TEXT },
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

    await queryInterface.addIndex('payment_gateway_settings', ['provider', 'environment'], { unique: true, name: 'payment_gateway_provider_env_unique' });
    await queryInterface.addIndex('payment_gateway_settings', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payment_gateway_settings');
  },
};
