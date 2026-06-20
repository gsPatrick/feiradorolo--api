'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('coupon_redemptions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      coupon_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'coupons', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      order_id: {
        type: Sequelize.UUID,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      discount_amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('coupon_redemptions', ['coupon_id']);
    await queryInterface.addIndex('coupon_redemptions', ['user_id']);
    await queryInterface.addIndex('coupon_redemptions', ['order_id']);
    await queryInterface.addIndex('coupon_redemptions', ['coupon_id', 'order_id'], { unique: true, name: 'coupon_redemptions_coupon_order_unique' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('coupon_redemptions');
  },
};
