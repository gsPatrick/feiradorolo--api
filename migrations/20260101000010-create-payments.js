'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_id: {
        type: Sequelize.UUID,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      provider: { type: Sequelize.ENUM('mercado_pago'), allowNull: false, defaultValue: 'mercado_pago' },
      external_id: { type: Sequelize.STRING(120) },
      preference_id: { type: Sequelize.STRING(120) },
      purpose: { type: Sequelize.ENUM('order', 'plan', 'highlight'), allowNull: false, defaultValue: 'order' },
      method: { type: Sequelize.ENUM('pix', 'credit_card', 'debit_card', 'boleto', 'account_money') },
      status: { type: Sequelize.ENUM('pending', 'in_process', 'authorized', 'approved', 'rejected', 'refunded', 'cancelled', 'charged_back'), allowNull: false, defaultValue: 'pending' },
      amount: { type: Sequelize.DECIMAL(12, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      installments: { type: Sequelize.INTEGER },
      platform_fee: { type: Sequelize.DECIMAL(12, 2) },
      gateway_fee: { type: Sequelize.DECIMAL(12, 2) },
      net_amount: { type: Sequelize.DECIMAL(12, 2) },
      split: { type: Sequelize.JSONB },
      payload: { type: Sequelize.JSONB },
      paid_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('payments', ['order_id']);
    await queryInterface.addIndex('payments', ['user_id']);
    await queryInterface.addIndex('payments', ['external_id']);
    await queryInterface.addIndex('payments', ['status']);
    await queryInterface.addIndex('payments', ['purpose']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};
