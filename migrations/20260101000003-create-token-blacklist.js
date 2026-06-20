'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('token_blacklist', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      jti: { type: Sequelize.STRING(128) },
      token: { type: Sequelize.TEXT, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reason: { type: Sequelize.STRING(120) },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('token_blacklist', ['jti']);
    await queryInterface.addIndex('token_blacklist', ['user_id']);
    await queryInterface.addIndex('token_blacklist', ['expires_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('token_blacklist');
  },
};
