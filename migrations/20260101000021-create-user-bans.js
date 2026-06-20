'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user_bans', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      banned_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      type: { type: Sequelize.ENUM('temporary', 'permanent'), allowNull: false, defaultValue: 'temporary' },
      scope: { type: Sequelize.ENUM('full', 'selling', 'buying', 'chat'), allowNull: false, defaultValue: 'full' },
      reason: { type: Sequelize.TEXT },
      starts_at: { type: Sequelize.DATE },
      expires_at: { type: Sequelize.DATE },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      lifted_at: { type: Sequelize.DATE },
      lifted_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('user_bans', ['user_id']);
    await queryInterface.addIndex('user_bans', ['is_active']);
    await queryInterface.addIndex('user_bans', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user_bans');
  },
};
