'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('commission_rules', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      scope: { type: Sequelize.ENUM('global', 'category', 'seller_tier', 'category_seller_tier'), allowNull: false, defaultValue: 'global' },
      category_id: {
        type: Sequelize.UUID,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      seller_tier: { type: Sequelize.ENUM('standard', 'premium') },
      commission_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: false },
      min_commission_amount: { type: Sequelize.DECIMAL(12, 2) },
      max_commission_amount: { type: Sequelize.DECIMAL(12, 2) },
      escrow_hold_days: { type: Sequelize.INTEGER },
      priority: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
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

    await queryInterface.addIndex('commission_rules', ['scope']);
    await queryInterface.addIndex('commission_rules', ['category_id']);
    await queryInterface.addIndex('commission_rules', ['seller_tier']);
    await queryInterface.addIndex('commission_rules', ['is_active']);
    await queryInterface.addIndex('commission_rules', ['priority']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('commission_rules');
  },
};
