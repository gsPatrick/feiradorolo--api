'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('category_pricing', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      pricing_model: { type: Sequelize.ENUM('free', 'commission', 'flat_fee', 'package'), allowNull: false, defaultValue: 'commission' },
      listing_fee: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      listing_duration_days: { type: Sequelize.INTEGER },
      listing_limit_free: { type: Sequelize.INTEGER },
      requires_plan: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
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

    await queryInterface.addIndex('category_pricing', ['pricing_model']);
    await queryInterface.addIndex('category_pricing', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('category_pricing');
  },
};
