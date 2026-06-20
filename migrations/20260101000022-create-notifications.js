'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      type: { type: Sequelize.STRING(80), allowNull: false },
      channel: { type: Sequelize.ENUM('push', 'in_app', 'email'), allowNull: false, defaultValue: 'in_app' },
      title: { type: Sequelize.STRING(180), allowNull: false },
      body: { type: Sequelize.TEXT },
      data: { type: Sequelize.JSONB },
      provider: { type: Sequelize.ENUM('fcm', 'onesignal', 'internal') },
      status: { type: Sequelize.ENUM('pending', 'sent', 'delivered', 'failed', 'read'), allowNull: false, defaultValue: 'pending' },
      sent_at: { type: Sequelize.DATE },
      read_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('notifications', ['user_id']);
    await queryInterface.addIndex('notifications', ['status']);
    await queryInterface.addIndex('notifications', ['type']);
    await queryInterface.addIndex('notifications', ['channel']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notifications');
  },
};
