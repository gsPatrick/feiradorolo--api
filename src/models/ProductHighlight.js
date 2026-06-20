'use strict';

/**
 * product_highlights — histórico de compras do upsell de Destaque.
 * Preços default (regras/3): Prata R$7,99 / Ouro R$14,99 / Diamante R$21,99
 * (parametrizáveis em platform_settings). Cada registro representa um período
 * de destaque pago para um produto.
 */
module.exports = (sequelize, DataTypes) => {
  const ProductHighlight = sequelize.define(
    'ProductHighlight',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      product_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false }, // vendedor que comprou
      tier: { type: DataTypes.ENUM('silver', 'gold', 'diamond'), allowNull: false },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      status: {
        type: DataTypes.ENUM('pending', 'active', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      payment_id: { type: DataTypes.UUID, allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      ends_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'product_highlights',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['product_id'] },
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['payment_id'] },
      ],
    }
  );

  ProductHighlight.associate = (models) => {
    ProductHighlight.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    ProductHighlight.belongsTo(models.User, { foreignKey: 'user_id', as: 'seller' });
    ProductHighlight.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
  };

  return ProductHighlight;
};
