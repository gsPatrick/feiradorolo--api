'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('plans', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      slug: { type: Sequelize.STRING(140), allowNull: false, unique: true },
      type: { type: Sequelize.ENUM('category_package', 'seller_premium', 'service_upgrade'), allowNull: false },
      category_id: {
        type: Sequelize.UUID,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      description: { type: Sequelize.TEXT },
      price: { type: Sequelize.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      duration_days: { type: Sequelize.INTEGER },
      listing_limit: { type: Sequelize.INTEGER },
      features: { type: Sequelize.JSONB },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('plans', ['type']);
    await queryInterface.addIndex('plans', ['category_id']);
    await queryInterface.addIndex('plans', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('plans');
  },
};
