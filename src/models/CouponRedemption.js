'use strict';

/**
 * coupon_redemptions — uso de cupons. Permite aplicar limites totais e por
 * usuário, e auditar o desconto concedido em cada pedido.
 */
module.exports = (sequelize, DataTypes) => {
  const CouponRedemption = sequelize.define(
    'CouponRedemption',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      coupon_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: true },
      discount_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, validate: { min: 0 } },
    },
    {
      tableName: 'coupon_redemptions',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['coupon_id'] },
        { fields: ['user_id'] },
        { fields: ['order_id'] },
        { unique: true, fields: ['coupon_id', 'order_id'] },
      ],
    }
  );

  CouponRedemption.associate = (models) => {
    CouponRedemption.belongsTo(models.Coupon, { foreignKey: 'coupon_id', as: 'coupon' });
    CouponRedemption.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    CouponRedemption.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
  };

  return CouponRedemption;
};
