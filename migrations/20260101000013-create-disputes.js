'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('disputes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      opened_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      against_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      reason: { type: Sequelize.ENUM('not_received', 'not_as_described', 'damaged', 'fraud', 'other'), allowNull: false },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('open', 'under_review', 'awaiting_response', 'resolved', 'rejected', 'cancelled'), allowNull: false, defaultValue: 'open' },
      resolution: { type: Sequelize.ENUM('refund_buyer', 'release_seller', 'partial_refund', 'none') },
      resolution_notes: { type: Sequelize.TEXT },
      amount_disputed: { type: Sequelize.DECIMAL(12, 2) },
      evidence: { type: Sequelize.JSONB },
      assigned_admin_id: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      resolved_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      resolved_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('disputes', ['order_id']);
    await queryInterface.addIndex('disputes', ['opened_by']);
    await queryInterface.addIndex('disputes', ['against_id']);
    await queryInterface.addIndex('disputes', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('disputes');
  },
};
