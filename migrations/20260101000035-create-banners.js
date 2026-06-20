'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('banners', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      title: { type: Sequelize.STRING(180), allowNull: false },
      subtitle: { type: Sequelize.STRING(180) },
      image_url: { type: Sequelize.STRING, allowNull: false },
      link_url: { type: Sequelize.STRING },
      position: { type: Sequelize.ENUM('home_hero', 'home_strip', 'category_top', 'sidebar'), allowNull: false, defaultValue: 'home_hero' },
      category_id: {
        type: Sequelize.UUID,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      starts_at: { type: Sequelize.DATE },
      ends_at: { type: Sequelize.DATE },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      impressions_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      clicks_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('banners', ['position']);
    await queryInterface.addIndex('banners', ['is_active']);
    await queryInterface.addIndex('banners', ['category_id']);
    await queryInterface.addIndex('banners', ['sort_order']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('banners');
  },
};
