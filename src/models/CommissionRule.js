'use strict';

/**
 * commission_rules — regras DINÂMICAS de comissão/split e prazo de escrow.
 * Resolução por especificidade (maior `priority` vence). Permite:
 *   - regra global (scope 'global')
 *   - por tier do vendedor: standard=10% / premium=12% (scope 'seller_tier')
 *   - por categoria (scope 'category') — ex.: categorias pagas por pacote
 *   - combinação categoria + tier (scope 'category_seller_tier')
 * `escrow_hold_days` NULL => usa o default global (platform_settings 'escrow.hold_days').
 *
 * Nenhum percentual fica hardcoded: o cálculo de split no checkout consulta
 * esta tabela (via cache no service de configurações).
 */
module.exports = (sequelize, DataTypes) => {
  const CommissionRule = sequelize.define(
    'CommissionRule',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(120), allowNull: false },
      scope: {
        type: DataTypes.ENUM('global', 'category', 'seller_tier', 'category_seller_tier'),
        allowNull: false,
        defaultValue: 'global',
      },
      category_id: { type: DataTypes.UUID, allowNull: true },
      seller_tier: { type: DataTypes.ENUM('standard', 'premium'), allowNull: true },

      // Percentual da plataforma (split). 0..100 — validação severa.
      commission_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        validate: { min: 0, max: 100 },
      },
      // Limites opcionais de valor da comissão.
      min_commission_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },
      max_commission_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },

      // Prazo de retenção do escrow para o escopo (NULL = default global).
      escrow_hold_days: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0, max: 365 } },

      priority: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'commission_rules',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['scope'] },
        { fields: ['category_id'] },
        { fields: ['seller_tier'] },
        { fields: ['is_active'] },
        { fields: ['priority'] },
      ],
    }
  );

  CommissionRule.associate = (models) => {
    CommissionRule.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    CommissionRule.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return CommissionRule;
};
