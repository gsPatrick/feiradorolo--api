'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_highlights', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' },
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
      tier: { type: Sequelize.ENUM('silver', 'gold', 'diamond'), allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      status: { type: Sequelize.ENUM('pending', 'active', 'expired', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      payment_id: {
        type: Sequelize.UUID,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      starts_at: { type: Sequelize.DATE },
      ends_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('product_highlights', ['product_id']);
    await queryInterface.addIndex('product_highlights', ['user_id']);
    await queryInterface.addIndex('product_highlights', ['status']);
    await queryInterface.addIndex('product_highlights', ['payment_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_highlights');
  },
};
