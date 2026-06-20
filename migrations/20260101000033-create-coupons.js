'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coupons', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      code: { type: Sequelize.STRING(40), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(180) },
      type: { type: Sequelize.ENUM('percentage', 'fixed'), allowNull: false, defaultValue: 'percentage' },
      value: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      max_discount_amount: { type: Sequelize.DECIMAL(12, 2) },
      min_order_amount: { type: Sequelize.DECIMAL(12, 2) },
      scope: { type: Sequelize.ENUM('all', 'category', 'seller', 'product'), allowNull: false, defaultValue: 'all' },
      category_id: {
        type: Sequelize.UUID,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      seller_id: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      product_id: {
        type: Sequelize.UUID,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      usage_limit: { type: Sequelize.INTEGER },
      usage_limit_per_user: { type: Sequelize.INTEGER },
      used_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      starts_at: { type: Sequelize.DATE },
      expires_at: { type: Sequelize.DATE },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('coupons', ['scope']);
    await queryInterface.addIndex('coupons', ['is_active']);
    await queryInterface.addIndex('coupons', ['category_id']);
    await queryInterface.addIndex('coupons', ['seller_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('coupons');
  },
};
