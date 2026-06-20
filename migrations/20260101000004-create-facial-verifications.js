'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('facial_verifications', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      context: { type: Sequelize.ENUM('seller', 'buyer'), allowNull: false },
      status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
      provider: { type: Sequelize.STRING(60) },
      external_reference: { type: Sequelize.STRING(180) },
      selfie_url: { type: Sequelize.STRING },
      document_url: { type: Sequelize.STRING },
      score: { type: Sequelize.DECIMAL(5, 2) },
      rejection_reason: { type: Sequelize.TEXT },
      reviewed_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      reviewed_at: { type: Sequelize.DATE },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('facial_verifications', ['user_id']);
    await queryInterface.addIndex('facial_verifications', ['context']);
    await queryInterface.addIndex('facial_verifications', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('facial_verifications');
  },
};
