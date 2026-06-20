'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('platform_settings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      key: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      value: { type: Sequelize.JSONB },
      group: { type: Sequelize.ENUM('commission', 'highlight', 'shipping', 'payment', 'security', 'general'), allowNull: false, defaultValue: 'general' },
      value_type: { type: Sequelize.ENUM('number', 'percentage', 'currency', 'string', 'boolean', 'json'), allowNull: false, defaultValue: 'json' },
      label: { type: Sequelize.STRING(180) },
      description: { type: Sequelize.TEXT },
      is_public: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      updated_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('platform_settings', ['group']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('platform_settings');
  },
};
