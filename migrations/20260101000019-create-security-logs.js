'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('security_logs', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      action: { type: Sequelize.STRING(120), allowNull: false },
      entity_type: { type: Sequelize.STRING(80) },
      entity_id: { type: Sequelize.STRING(80) },
      severity: { type: Sequelize.ENUM('info', 'warning', 'critical'), allowNull: false, defaultValue: 'info' },
      status: { type: Sequelize.ENUM('success', 'failure'), allowNull: false, defaultValue: 'success' },
      description: { type: Sequelize.TEXT },
      ip_address: { type: Sequelize.STRING(45) },
      user_agent: { type: Sequelize.STRING },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('security_logs', ['user_id']);
    await queryInterface.addIndex('security_logs', ['action']);
    await queryInterface.addIndex('security_logs', ['severity']);
    await queryInterface.addIndex('security_logs', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('security_logs', ['created_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('security_logs');
  },
};
