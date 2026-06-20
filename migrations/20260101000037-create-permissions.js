'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('permissions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      key: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      description: { type: Sequelize.STRING(255) },
      module: { type: Sequelize.STRING(60), allowNull: false },
      action: { type: Sequelize.STRING(40), allowNull: false },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('permissions', ['module']);
    await queryInterface.addIndex('permissions', ['action']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('permissions');
  },
};
