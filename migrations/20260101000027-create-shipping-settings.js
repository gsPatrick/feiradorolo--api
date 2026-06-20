'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shipping_settings', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false, defaultValue: 'default' },
      provider: { type: Sequelize.ENUM('melhor_envio'), allowNull: false, defaultValue: 'melhor_envio' },
      markup_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false, defaultValue: 0 },
      markup_fixed: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      free_shipping_enabled: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      free_shipping_min_order: { type: Sequelize.DECIMAL(12, 2) },
      free_shipping_categories: { type: Sequelize.JSONB },
      max_weight_grams: { type: Sequelize.INTEGER },
      max_declared_value: { type: Sequelize.DECIMAL(12, 2) },
      max_dimensions: { type: Sequelize.JSONB },
      default_origin_zip: { type: Sequelize.STRING(9) },
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

    await queryInterface.addIndex('shipping_settings', ['provider']);
    await queryInterface.addIndex('shipping_settings', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipping_settings');
  },
};
