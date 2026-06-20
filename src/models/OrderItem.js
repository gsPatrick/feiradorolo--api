'use strict';

/**
 * order_items — itens do pedido. Guarda SNAPSHOT do título e do preço no
 * momento da compra (o produto pode mudar/ser removido depois).
 */
module.exports = (sequelize, DataTypes) => {
  const OrderItem = sequelize.define(
    'OrderItem',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: { type: DataTypes.UUID, allowNull: false },
      product_id: { type: DataTypes.UUID, allowNull: true }, // SET NULL se produto removido
      title_snapshot: { type: DataTypes.STRING(180), allowNull: false },
      unit_price: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      variation: { type: DataTypes.JSONB, allowNull: true }, // variação selecionada
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
    },
    {
      tableName: 'order_items',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['order_id'] }, { fields: ['product_id'] }],
    }
  );

  OrderItem.associate = (models) => {
    OrderItem.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    OrderItem.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
  };

  return OrderItem;
};
