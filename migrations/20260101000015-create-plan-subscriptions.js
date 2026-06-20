'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plan_subscriptions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      plan_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      payment_id: {
        type: Sequelize.UUID,
        references: { model: 'payments', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      status: { type: Sequelize.ENUM('pending', 'active', 'expired', 'cancelled'), allowNull: false, defaultValue: 'pending' },
      starts_at: { type: Sequelize.DATE },
      ends_at: { type: Sequelize.DATE },
      listings_used: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      auto_renew: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('plan_subscriptions', ['user_id']);
    await queryInterface.addIndex('plan_subscriptions', ['plan_id']);
    await queryInterface.addIndex('plan_subscriptions', ['status']);
    await queryInterface.addIndex('plan_subscriptions', ['payment_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plan_subscriptions');
  },
};
