'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('categories', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(120), allowNull: false },
      slug: { type: Sequelize.STRING(140), allowNull: false, unique: true },
      parent_id: {
        type: Sequelize.UUID,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      description: { type: Sequelize.TEXT },
      monetization_model: { type: Sequelize.ENUM('commission', 'package', 'free', 'free_geo'), allowNull: false, defaultValue: 'commission' },
      requires_geolocation: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      allows_highlight: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      allows_shipping: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      icon: { type: Sequelize.STRING(80) },
      image_url: { type: Sequelize.STRING },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('categories', ['parent_id']);
    await queryInterface.addIndex('categories', ['monetization_model']);
    await queryInterface.addIndex('categories', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('categories');
  },
};
