'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('device_tokens', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      token: { type: Sequelize.STRING, allowNull: false, unique: true },
      platform: { type: Sequelize.ENUM('android', 'ios', 'web'), allowNull: false, defaultValue: 'web' },
      provider: { type: Sequelize.ENUM('fcm', 'onesignal'), allowNull: false, defaultValue: 'fcm' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      last_used_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('device_tokens', ['user_id']);
    await queryInterface.addIndex('device_tokens', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('device_tokens');
  },
};
