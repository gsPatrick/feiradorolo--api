'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('order_items', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      product_id: {
        type: Sequelize.UUID,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      title_snapshot: { type: Sequelize.STRING(180), allowNull: false },
      unit_price: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      quantity: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      variation: { type: Sequelize.JSONB },
      subtotal: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('order_items', ['order_id']);
    await queryInterface.addIndex('order_items', ['product_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('order_items');
  },
};
