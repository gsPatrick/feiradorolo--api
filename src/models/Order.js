'use strict';

/**
 * orders — pedido por vendedor (marketplace). Guarda snapshots financeiros
 * da comissão aplicada (regras/3) para auditoria, independente de mudanças
 * futuras em platform_settings.
 */
module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define(
    'Order',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_number: { type: DataTypes.STRING(30), allowNull: false, unique: true },
      buyer_id: { type: DataTypes.UUID, allowNull: false },
      seller_id: { type: DataTypes.UUID, allowNull: false },

      status: {
        type: DataTypes.ENUM(
          'pending',
          'awaiting_payment',
          'paid',
          'processing',
          'shipped',
          'delivered',
          'completed',
          'cancelled',
          'refunded',
          'disputed'
        ),
        allowNull: false,
        defaultValue: 'pending',
      },

      // Valores.
      subtotal: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      shipping_cost: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      discount: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      total: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },

      // Snapshot de comissão (split).
      commission_rate: { type: DataTypes.DECIMAL(5, 2), allowNull: true }, // % aplicado
      commission_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      seller_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // líquido ao vendedor

      payment_status: {
        type: DataTypes.ENUM('pending', 'paid', 'refunded', 'failed', 'chargeback'),
        allowNull: false,
        defaultValue: 'pending',
      },
      shipping_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'shipped', 'delivered', 'returned'),
        allowNull: false,
        defaultValue: 'pending',
      },

      // KYC: pedido retido até o comprador concluir a verificação facial (1ª compra).
      held_for_buyer_verification: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      // Entrega: envio (shipping) ou retirada presencial (pickup, com token de escrow).
      delivery_method: { type: DataTypes.ENUM('shipping', 'pickup'), allowNull: false, defaultValue: 'shipping' },

      notes: { type: DataTypes.TEXT, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },

      placed_at: { type: DataTypes.DATE, allowNull: true },
      paid_at: { type: DataTypes.DATE, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      cancelled_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'orders',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['order_number'] },
        { fields: ['buyer_id'] },
        { fields: ['seller_id'] },
        { fields: ['status'] },
        { fields: ['payment_status'] },
      ],
    }
  );

  Order.associate = (models) => {
    Order.belongsTo(models.User, { foreignKey: 'buyer_id', as: 'buyer' });
    Order.belongsTo(models.User, { foreignKey: 'seller_id', as: 'seller' });
    Order.hasMany(models.OrderItem, { foreignKey: 'order_id', as: 'items' });
    Order.hasMany(models.Payment, { foreignKey: 'order_id', as: 'payments' });
    Order.hasOne(models.Escrow, { foreignKey: 'order_id', as: 'escrow' });
    Order.hasMany(models.Shipment, { foreignKey: 'order_id', as: 'shipments' });
    Order.hasMany(models.Dispute, { foreignKey: 'order_id', as: 'disputes' });
    Order.hasMany(models.Chat, { foreignKey: 'order_id', as: 'chats' });
  };

  return Order;
};
