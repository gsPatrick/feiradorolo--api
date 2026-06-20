'use strict';

/**
 * plans — catálogo de planos pagos. Cobre os modelos de monetização que NÃO são
 * comissão por venda (regras/3):
 *   - category_package : pacotes de Imóveis/Veículos (com limite de anúncios)
 *   - seller_premium   : assinatura que torna o vendedor premium (comissão 12%)
 *   - service_upgrade  : upgrade pago para categorias de Serviços (grátis)
 * As compras/assinaturas ficam em plan_subscriptions.
 */
module.exports = (sequelize, DataTypes) => {
  const Plan = sequelize.define(
    'Plan',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(120), allowNull: false },
      slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      type: {
        type: DataTypes.ENUM('category_package', 'seller_premium', 'service_upgrade'),
        allowNull: false,
      },
      category_id: { type: DataTypes.UUID, allowNull: true }, // aplicável a pacotes de categoria
      description: { type: DataTypes.TEXT, allowNull: true },
      price: { type: DataTypes.DECIMAL(10, 2), allowNull: false, defaultValue: 0 },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      duration_days: { type: DataTypes.INTEGER, allowNull: true }, // validade
      listing_limit: { type: DataTypes.INTEGER, allowNull: true }, // qtd de anúncios
      features: { type: DataTypes.JSONB, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'plans',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['slug'] },
        { fields: ['type'] },
        { fields: ['category_id'] },
        { fields: ['is_active'] },
      ],
    }
  );

  Plan.associate = (models) => {
    Plan.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    Plan.hasMany(models.PlanSubscription, { foreignKey: 'plan_id', as: 'subscriptions' });
  };

  return Plan;
};
