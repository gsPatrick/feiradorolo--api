'use strict';

/**
 * shipping_settings — regras DINÂMICAS de frete (Melhor Envio).
 * - `markup_percent` / `markup_fixed`: acréscimo aplicado sobre o frete cotado.
 * - frete grátis: habilitação + valor mínimo de pedido + categorias elegíveis.
 * - limites operacionais: peso/valor declarado/dimensões máximas.
 * A simulação de frete no checkout consulta a linha ativa antes de calcular.
 */
module.exports = (sequelize, DataTypes) => {
  const ShippingSetting = sequelize.define(
    'ShippingSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'default' },
      provider: {
        type: DataTypes.ENUM('melhor_envio'),
        allowNull: false,
        defaultValue: 'melhor_envio',
      },

      // Markup sobre o frete (validação severa: não-negativo / <= 100% no percentual).
      markup_percent: {
        type: DataTypes.DECIMAL(5, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0, max: 100 },
      },
      markup_fixed: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },

      // Regras de frete grátis.
      free_shipping_enabled: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      free_shipping_min_order: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },
      free_shipping_categories: { type: DataTypes.JSONB, allowNull: true }, // array de category_id

      // Limites operacionais de envio.
      max_weight_grams: { type: DataTypes.INTEGER, allowNull: true, validate: { min: 0 } },
      max_declared_value: { type: DataTypes.DECIMAL(12, 2), allowNull: true, validate: { min: 0 } },
      max_dimensions: { type: DataTypes.JSONB, allowNull: true }, // { height, width, length } em cm
      default_origin_zip: { type: DataTypes.STRING(9), allowNull: true },

      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'shipping_settings',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['provider'] },
        { fields: ['is_active'] },
      ],
    }
  );

  ShippingSetting.associate = (models) => {
    ShippingSetting.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return ShippingSetting;
};
