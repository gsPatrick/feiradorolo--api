'use strict';

/**
 * coupons — regras de desconto/promoção definidas pelo admin (ou vendedor, se
 * permitido). Alimenta orders.discount via coupon_redemptions. `type`
 * percentage usa `value` 0..100 (validação no service) com teto opcional
 * `max_discount_amount`; `type` fixed usa `value` em BRL.
 */
module.exports = (sequelize, DataTypes) => {
  const Coupon = sequelize.define(
    'Coupon',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      code: { type: DataTypes.STRING(40), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(180), allowNull: true },
      type: { type: DataTypes.ENUM('percentage', 'fixed'), allowNull: false, defaultValue: 'percentage' },
      value: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0 } },
      max_discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },
      min_order_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },

      scope: { type: DataTypes.ENUM('all', 'category', 'seller', 'product'), allowNull: false, defaultValue: 'all' },
      category_id: { type: DataTypes.UUID, allowNull: true },
      seller_id: { type: DataTypes.UUID, allowNull: true },
      product_id: { type: DataTypes.UUID, allowNull: true },

      usage_limit: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
      usage_limit_per_user: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
      used_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },

      starts_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'coupons',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['code'] },
        { fields: ['scope'] },
        { fields: ['is_active'] },
        { fields: ['category_id'] },
        { fields: ['seller_id'] },
      ],
    }
  );

  Coupon.associate = (models) => {
    Coupon.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    Coupon.belongsTo(models.User, { foreignKey: 'seller_id', as: 'seller' });
    Coupon.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    Coupon.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
    Coupon.hasMany(models.CouponRedemption, { foreignKey: 'coupon_id', as: 'redemptions' });
  };

  return Coupon;
};
