'use strict';

/**
 * category_pricing — precificação de PUBLICAÇÃO por categoria (dinâmica).
 * Governa as taxas por categoria (regras/3):
 *   - produtos gerais -> 'commission' (cobrança via commission_rules na venda)
 *   - Imóveis/Veículos -> 'package'/'flat_fee' (pagos para anunciar)
 *   - Serviços/Causa Animal -> 'free'
 * `listing_fee` é o valor de publicação; `listing_limit_free` permite N anúncios
 * grátis antes de cobrar. Uma linha por categoria.
 */
module.exports = (sequelize, DataTypes) => {
  const CategoryPricing = sequelize.define(
    'CategoryPricing',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      category_id: { type: DataTypes.UUID, allowNull: false, unique: true },
      pricing_model: {
        type: DataTypes.ENUM('free', 'commission', 'flat_fee', 'package'),
        allowNull: false,
        defaultValue: 'commission',
      },
      listing_fee: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      listing_duration_days: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 1, max: 365 } },
      listing_limit_free: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
      requires_plan: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // Imóveis/Veículos
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'category_pricing',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['category_id'] },
        { fields: ['pricing_model'] },
        { fields: ['is_active'] },
      ],
    }
  );

  CategoryPricing.associate = (models) => {
    CategoryPricing.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    CategoryPricing.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return CategoryPricing;
};
