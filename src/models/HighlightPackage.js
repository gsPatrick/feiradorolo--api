'use strict';

/**
 * highlight_packages — preços e VIGÊNCIA dinâmicos do upsell de destaque.
 * Substitui os valores antes hardcoded (Prata R$7,99 / Ouro R$14,99 /
 * Diamante R$21,99). O `tier` casa com products.highlight_tier; aqui ficam
 * preço, duração e benefícios — todos editáveis pelo admin.
 */
module.exports = (sequelize, DataTypes) => {
  const HighlightPackage = sequelize.define(
    'HighlightPackage',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      tier: {
        type: DataTypes.ENUM('silver', 'gold', 'diamond'),
        allowNull: false,
        unique: true,
      },
      name: { type: DataTypes.STRING(80), allowNull: false },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: { min: 0 },
      },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      duration_days: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 1, max: 365 },
      },
      benefits: { type: DataTypes.JSONB, allowNull: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'highlight_packages',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['is_active'] }, { fields: ['sort_order'] }],
    }
  );

  HighlightPackage.associate = (models) => {
    HighlightPackage.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return HighlightPackage;
};
