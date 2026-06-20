'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('setting_change_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      entity: { type: Sequelize.ENUM('platform_setting', 'commission_rule', 'shipping_setting', 'highlight_package', 'category_pricing', 'payment_gateway'), allowNull: false },
      entity_id: { type: Sequelize.STRING(80) },
      setting_key: { type: Sequelize.STRING(120) },
      action: { type: Sequelize.ENUM('create', 'update', 'delete', 'restore_default'), allowNull: false, defaultValue: 'update' },
      old_value: { type: Sequelize.JSONB },
      new_value: { type: Sequelize.JSONB },
      changed_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      ip_address: { type: Sequelize.STRING(45) },
      user_agent: { type: Sequelize.STRING },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('setting_change_logs', ['entity']);
    await queryInterface.addIndex('setting_change_logs', ['entity_id']);
    await queryInterface.addIndex('setting_change_logs', ['changed_by']);
    await queryInterface.addIndex('setting_change_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('setting_change_logs');
  },
};
