'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('role_permissions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      role_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'roles', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      permission_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'permissions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('role_permissions', ['role_id', 'permission_id'], { unique: true, name: 'role_permissions_role_permission_unique' });
    await queryInterface.addIndex('role_permissions', ['permission_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('role_permissions');
  },
};
