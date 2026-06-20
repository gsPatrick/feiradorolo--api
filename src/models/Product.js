'use strict';

/**
 * products — anúncios publicados pelos vendedores.
 * - `specifications` (JSONB): valores dos field_definitions da categoria.
 * - `variations` (JSONB): variações (tamanho/cor/etc.).
 * - `images` (JSONB): array de URLs (Firebase Storage).
 * - `highlight_tier`: destaque vigente (upsell); histórico em product_highlights.
 * - geolocalização: usada por Causa Animal e retirada local.
 */
module.exports = (sequelize, DataTypes) => {
  const Product = sequelize.define(
    'Product',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      seller_id: { type: DataTypes.UUID, allowNull: false },
      category_id: { type: DataTypes.UUID, allowNull: false },

      title: { type: DataTypes.STRING(180), allowNull: false },
      slug: { type: DataTypes.STRING(220), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },

      price: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      promotional_price: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },

      condition: { type: DataTypes.ENUM('new', 'used', 'refurbished'), allowNull: true },
      stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      sku: { type: DataTypes.STRING(80), allowNull: true },

      status: {
        type: DataTypes.ENUM(
          'draft',
          'pending_review',
          'active',
          'paused',
          'sold',
          'rejected',
          'archived'
        ),
        allowNull: false,
        defaultValue: 'draft',
      },

      specifications: { type: DataTypes.JSONB, allowNull: true },
      variations: { type: DataTypes.JSONB, allowNull: true },
      images: { type: DataTypes.JSONB, allowNull: true },
      cover_image_url: { type: DataTypes.STRING, allowNull: true },

      // Upsell de destaque vigente.
      highlight_tier: {
        type: DataTypes.ENUM('none', 'silver', 'gold', 'diamond'),
        allowNull: false,
        defaultValue: 'none',
      },
      highlight_expires_at: { type: DataTypes.DATE, allowNull: true },

      // Logística / frete.
      requires_shipping: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      weight_grams: { type: DataTypes.INTEGER, allowNull: true },
      dimensions: { type: DataTypes.JSONB, allowNull: true }, // { height, width, length }

      // Geolocalização / localização do anúncio.
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      state: { type: DataTypes.STRING(2), allowNull: true },

      views_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      favorites_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      published_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'products',
      underscored: true,
      timestamps: true,
      paranoid: true,
      indexes: [
        { fields: ['seller_id'] },
        { fields: ['category_id'] },
        { fields: ['status'] },
        { fields: ['highlight_tier'] },
        { fields: ['slug'] },
        { fields: ['latitude', 'longitude'] },
      ],
    }
  );

  Product.associate = (models) => {
    Product.belongsTo(models.User, { foreignKey: 'seller_id', as: 'seller' });
    Product.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    Product.hasMany(models.OrderItem, { foreignKey: 'product_id', as: 'orderItems' });
    Product.hasMany(models.ProductHighlight, { foreignKey: 'product_id', as: 'highlights' });
    Product.hasMany(models.Chat, { foreignKey: 'product_id', as: 'chats' });
  };

  return Product;
};
