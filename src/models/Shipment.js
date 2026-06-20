'use strict';

/**
 * shipments — envios/logística via Melhor Envio. Guarda etiqueta, rastreio,
 * custo do frete e os endereços (JSONB) usados na cotação.
 */
module.exports = (sequelize, DataTypes) => {
  const Shipment = sequelize.define(
    'Shipment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: { type: DataTypes.UUID, allowNull: false },
      provider: {
        type: DataTypes.ENUM('melhor_envio'),
        allowNull: false,
        defaultValue: 'melhor_envio',
      },
      external_id: { type: DataTypes.STRING(120), allowNull: true }, // id no Melhor Envio
      service_name: { type: DataTypes.STRING(60), allowNull: true }, // ex.: PAC, SEDEX
      service_code: { type: DataTypes.STRING(40), allowNull: true },
      tracking_code: { type: DataTypes.STRING(80), allowNull: true },
      label_url: { type: DataTypes.STRING, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          'pending',
          'purchased',
          'posted',
          'in_transit',
          'delivered',
          'cancelled',
          'returned'
        ),
        allowNull: false,
        defaultValue: 'pending',
      },
      cost: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      estimated_delivery_days: { type: DataTypes.INTEGER, allowNull: true },
      from_address: { type: DataTypes.JSONB, allowNull: true },
      to_address: { type: DataTypes.JSONB, allowNull: true },
      dimensions: { type: DataTypes.JSONB, allowNull: true }, // peso/altura/largura/comprimento
      payload: { type: DataTypes.JSONB, allowNull: true },
      posted_at: { type: DataTypes.DATE, allowNull: true },
      delivered_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'shipments',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['tracking_code'] },
        { fields: ['status'] },
      ],
    }
  );

  Shipment.associate = (models) => {
    Shipment.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
  };

  return Shipment;
};
