'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('blocked_words', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      word: { type: Sequelize.STRING(120), allowNull: false, unique: true },
      severity: { type: Sequelize.ENUM('low', 'medium', 'high'), allowNull: false, defaultValue: 'medium' },
      action: { type: Sequelize.ENUM('flag', 'block', 'mask'), allowNull: false, defaultValue: 'flag' },
      scope: { type: Sequelize.ENUM('all', 'chat', 'product', 'review'), allowNull: false, defaultValue: 'all' },
      is_regex: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('blocked_words', ['scope']);
    await queryInterface.addIndex('blocked_words', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('blocked_words');
  },
};
