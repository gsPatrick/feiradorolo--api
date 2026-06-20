'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('highlight_packages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      tier: { type: Sequelize.ENUM('silver', 'gold', 'diamond'), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(80), allowNull: false },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      duration_days: { type: Sequelize.INTEGER, allowNull: false },
      benefits: { type: Sequelize.JSONB },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('highlight_packages', ['is_active']);
    await queryInterface.addIndex('highlight_packages', ['sort_order']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('highlight_packages');
  },
};
