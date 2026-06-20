'use strict';

/**
 * plan_subscriptions — compras/assinaturas de planos (pacotes de Imóveis/
 * Veículos, premium do vendedor, upgrades de Serviços).
 */
module.exports = (sequelize, DataTypes) => {
  const PlanSubscription = sequelize.define(
    'PlanSubscription',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      plan_id: { type: DataTypes.UUID, allowNull: false },
      payment_id: { type: DataTypes.UUID, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'active', 'expired', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending',
      },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      ends_at: { type: DataTypes.DATE, allowNull: true },
      listings_used: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      auto_renew: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'plan_subscriptions',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['plan_id'] },
        { fields: ['status'] },
        { fields: ['payment_id'] },
      ],
    }
  );

  PlanSubscription.associate = (models) => {
    PlanSubscription.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    PlanSubscription.belongsTo(models.Plan, { foreignKey: 'plan_id', as: 'plan' });
    PlanSubscription.belongsTo(models.Payment, { foreignKey: 'payment_id', as: 'payment' });
  };

  return PlanSubscription;
};
