'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('orders', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_number: { type: Sequelize.STRING(30), allowNull: false, unique: true },
      buyer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      seller_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      status: { type: Sequelize.ENUM('pending', 'awaiting_payment', 'paid', 'processing', 'shipped', 'delivered', 'completed', 'cancelled', 'refunded', 'disputed'), allowNull: false, defaultValue: 'pending' },
      subtotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      shipping_cost: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      commission_rate: { type: Sequelize.DECIMAL(5, 2) },
      commission_amount: { type: Sequelize.DECIMAL(12, 2) },
      seller_amount: { type: Sequelize.DECIMAL(12, 2) },
      payment_status: { type: Sequelize.ENUM('pending', 'paid', 'refunded', 'failed', 'chargeback'), allowNull: false, defaultValue: 'pending' },
      shipping_status: { type: Sequelize.ENUM('not_required', 'pending', 'shipped', 'delivered', 'returned'), allowNull: false, defaultValue: 'pending' },
      notes: { type: Sequelize.TEXT },
      metadata: { type: Sequelize.JSONB },
      placed_at: { type: Sequelize.DATE },
      paid_at: { type: Sequelize.DATE },
      completed_at: { type: Sequelize.DATE },
      cancelled_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('orders', ['buyer_id']);
    await queryInterface.addIndex('orders', ['seller_id']);
    await queryInterface.addIndex('orders', ['status']);
    await queryInterface.addIndex('orders', ['payment_status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('orders');
  },
};
