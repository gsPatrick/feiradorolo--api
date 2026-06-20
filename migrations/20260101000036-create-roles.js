'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roles', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(80), allowNull: false },
      slug: { type: Sequelize.STRING(80), allowNull: false, unique: true },
      description: { type: Sequelize.STRING(255) },
      level: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('roles', ['is_active']);
    await queryInterface.addIndex('roles', ['level']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('roles');
  },
};
