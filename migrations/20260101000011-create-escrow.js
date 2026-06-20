'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('escrow', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      payment_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      seller_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      status: { type: Sequelize.ENUM('held', 'released', 'refunded', 'disputed', 'cancelled'), allowNull: false, defaultValue: 'held' },
      hold_days: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 7 },
      held_at: { type: Sequelize.DATE },
      release_due_at: { type: Sequelize.DATE },
      released_at: { type: Sequelize.DATE },
      released_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      release_reason: { type: Sequelize.STRING(180) },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('escrow', ['order_id']);
    await queryInterface.addIndex('escrow', ['payment_id']);
    await queryInterface.addIndex('escrow', ['seller_id']);
    await queryInterface.addIndex('escrow', ['status']);
    await queryInterface.addIndex('escrow', ['release_due_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('escrow');
  },
};
