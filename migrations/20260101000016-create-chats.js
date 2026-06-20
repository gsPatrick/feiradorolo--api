'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('chats', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      product_id: {
        type: Sequelize.UUID,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      order_id: {
        type: Sequelize.UUID,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
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
      subject: { type: Sequelize.STRING(180) },
      status: { type: Sequelize.ENUM('open', 'closed', 'archived', 'flagged'), allowNull: false, defaultValue: 'open' },
      is_flagged: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      last_message_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('chats', ['buyer_id']);
    await queryInterface.addIndex('chats', ['seller_id']);
    await queryInterface.addIndex('chats', ['product_id']);
    await queryInterface.addIndex('chats', ['order_id']);
    await queryInterface.addIndex('chats', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('chats');
  },
};
