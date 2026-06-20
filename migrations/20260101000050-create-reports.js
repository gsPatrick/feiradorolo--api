'use strict';

/** reports — denúncias de conteúdo (perguntas, mensagens, produtos, etc.). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reports', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      reporter_id: { type: Sequelize.UUID, allowNull: true },
      target_type: {
        type: Sequelize.ENUM('question', 'message', 'product', 'review', 'user', 'chat'),
        allowNull: false,
      },
      target_id: { type: Sequelize.UUID, allowNull: false },
      reason: {
        type: Sequelize.ENUM('spam', 'offensive', 'inappropriate', 'fraud', 'external_contact', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      description: { type: Sequelize.TEXT, allowNull: true },
      snapshot: { type: Sequelize.JSONB, allowNull: true },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      resolution: { type: Sequelize.TEXT, allowNull: true },
      resolved_by: { type: Sequelize.UUID, allowNull: true },
      resolved_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('reports', ['status']);
    await queryInterface.addIndex('reports', ['target_type']);
    await queryInterface.addIndex('reports', ['reporter_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reports');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reports_target_type";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reports_reason";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_reports_status";');
  },
};
