'use strict';

/**
 * escrow — custódia do valor do vendedor por 7 dias (regras/3).
 * `release_due_at` = held_at + hold_days. A liberação só ocorre se não houver
 * disputa aberta. `hold_days` default vem de platform_settings (escrow.hold_days).
 */
module.exports = (sequelize, DataTypes) => {
  const Escrow = sequelize.define(
    'Escrow',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: { type: DataTypes.UUID, allowNull: false },
      payment_id: { type: DataTypes.UUID, allowNull: false },
      seller_id: { type: DataTypes.UUID, allowNull: false },

      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false }, // valor retido
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      status: {
        type: DataTypes.ENUM('held', 'released', 'refunded', 'disputed', 'cancelled'),
        allowNull: false,
        defaultValue: 'held',
      },
      hold_days: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 7 },
      held_at: { type: DataTypes.DATE, allowNull: true },
      release_due_at: { type: DataTypes.DATE, allowNull: true }, // held_at + 7 dias
      released_at: { type: DataTypes.DATE, allowNull: true },
      released_by: { type: DataTypes.UUID, allowNull: true }, // admin/sistema
      release_reason: { type: DataTypes.STRING(180), allowNull: true },
      // Token numérico de 6 dígitos para liberação presencial (retirada).
      pickup_token: { type: DataTypes.STRING(6), allowNull: true },
    },
    {
      tableName: 'escrow',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['payment_id'] },
        { fields: ['seller_id'] },
        { fields: ['status'] },
        { fields: ['release_due_at'] },
      ],
    }
  );

  Escrow.associate = (models) => {
    Escrow.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    Escrow.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
    Escrow.belongsTo(models.User, { foreignKey: 'seller_id', as: 'seller' });
  };

  return Escrow;
};
