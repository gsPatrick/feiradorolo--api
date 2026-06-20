'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('products', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      seller_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      title: { type: Sequelize.STRING(180), allowNull: false },
      slug: { type: Sequelize.STRING(220) },
      description: { type: Sequelize.TEXT },
      price: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      promotional_price: { type: Sequelize.DECIMAL(12, 2) },
      currency: { type: Sequelize.STRING(3), allowNull: false, defaultValue: 'BRL' },
      condition: { type: Sequelize.ENUM('new', 'used', 'refurbished') },
      stock: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      sku: { type: Sequelize.STRING(80) },
      status: { type: Sequelize.ENUM('draft', 'pending_review', 'active', 'paused', 'sold', 'rejected', 'archived'), allowNull: false, defaultValue: 'draft' },
      specifications: { type: Sequelize.JSONB },
      variations: { type: Sequelize.JSONB },
      images: { type: Sequelize.JSONB },
      cover_image_url: { type: Sequelize.STRING },
      highlight_tier: { type: Sequelize.ENUM('none', 'silver', 'gold', 'diamond'), allowNull: false, defaultValue: 'none' },
      highlight_expires_at: { type: Sequelize.DATE },
      requires_shipping: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      weight_grams: { type: Sequelize.INTEGER },
      dimensions: { type: Sequelize.JSONB },
      latitude: { type: Sequelize.DECIMAL(10, 7) },
      longitude: { type: Sequelize.DECIMAL(10, 7) },
      city: { type: Sequelize.STRING(120) },
      state: { type: Sequelize.STRING(2) },
      views_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      favorites_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      published_at: { type: Sequelize.DATE },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      deleted_at: { type: Sequelize.DATE },
    });

    await queryInterface.addIndex('products', ['seller_id']);
    await queryInterface.addIndex('products', ['category_id']);
    await queryInterface.addIndex('products', ['status']);
    await queryInterface.addIndex('products', ['highlight_tier']);
    await queryInterface.addIndex('products', ['slug']);
    await queryInterface.addIndex('products', ['latitude', 'longitude']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('products');
  },
};
