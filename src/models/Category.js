'use strict';

/**
 * categories — categorias de anúncios. `monetization_model` codifica as regras
 * de negócio (regras/3):
 *   - commission : produtos gerais (10% padrão / 12% premium)
 *   - package    : Imóveis e Veículos (pagos por pacotes)
 *   - free       : Serviços (grátis, com upgrade de destaque)
 *   - free_geo   : Causa Animal (100% gratuita, exige geolocalização)
 * Suporta subcategorias via `parent_id` (auto-referência).
 */
module.exports = (sequelize, DataTypes) => {
  const Category = sequelize.define(
    'Category',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      parent_id: { type: DataTypes.UUID, allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },

      monetization_model: {
        type: DataTypes.ENUM('commission', 'package', 'free', 'free_geo'),
        allowNull: false,
        defaultValue: 'commission',
      },
      requires_geolocation: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false, // true para Causa Animal
      },
      allows_highlight: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      allows_shipping: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

      icon: { type: DataTypes.STRING(80), allowNull: true },
      image_url: { type: DataTypes.STRING, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'categories',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['slug'] },
        { fields: ['parent_id'] },
        { fields: ['monetization_model'] },
        { fields: ['is_active'] },
      ],
    }
  );

  Category.associate = (models) => {
    Category.belongsTo(models.Category, { foreignKey: 'parent_id', as: 'parent' });
    Category.hasMany(models.Category, { foreignKey: 'parent_id', as: 'children' });
    Category.hasMany(models.FieldDefinition, { foreignKey: 'category_id', as: 'fields' });
    Category.hasMany(models.Product, { foreignKey: 'category_id', as: 'products' });
    Category.hasMany(models.Plan, { foreignKey: 'category_id', as: 'plans' });
    Category.hasMany(models.CommissionRule, { foreignKey: 'category_id', as: 'commissionRules' });
    Category.hasOne(models.CategoryPricing, { foreignKey: 'category_id', as: 'pricing' });
  };

  return Category;
};
