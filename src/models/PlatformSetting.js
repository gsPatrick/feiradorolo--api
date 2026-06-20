'use strict';

/**
 * platform_settings — configurações dinâmicas da plataforma (aba Receitas do
 * admin, hoje decorativa). Fonte da verdade em runtime para comissões,
 * destaques e frete. Formato chave/valor com `value` em JSONB para suportar
 * qualquer tipo (número, %, objeto de faixas de frete, etc.).
 *
 * Exemplos de chaves: 'commission.standard', 'commission.premium',
 * 'highlight.silver', 'highlight.gold', 'highlight.diamond', 'escrow.hold_days'.
 */
module.exports = (sequelize, DataTypes) => {
  const PlatformSetting = sequelize.define(
    'PlatformSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      value: { type: DataTypes.JSONB, allowNull: true },
      group: {
        type: DataTypes.ENUM('commission', 'highlight', 'shipping', 'payment', 'security', 'general'),
        allowNull: false,
        defaultValue: 'general',
      },
      value_type: {
        type: DataTypes.ENUM('number', 'percentage', 'currency', 'string', 'boolean', 'json'),
        allowNull: false,
        defaultValue: 'json',
      },
      label: { type: DataTypes.STRING(180), allowNull: true },
      description: { type: DataTypes.TEXT, allowNull: true },

      // Valor padrão de fábrica — usado pelo recurso "restaurar padrões".
      default_value: { type: DataTypes.JSONB, allowNull: true },

      // Metadados de validação severa (impede valores que quebrem a matemática).
      min_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      max_value: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      options: { type: DataTypes.JSONB, allowNull: true }, // conjunto permitido (enum)
      unit: { type: DataTypes.STRING(20), allowNull: true }, // %, BRL, dias, ...

      // Governança.
      is_public: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // exposto ao frontend
      is_editable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // admin pode editar
      is_sensitive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // mascarar na UI/logs
      is_encrypted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // value guarda ciphertext
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      updated_by: { type: DataTypes.UUID, allowNull: true }, // admin que alterou
    },
    {
      tableName: 'platform_settings',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['key'] }, { fields: ['group'] }],
    }
  );

  PlatformSetting.associate = (models) => {
    PlatformSetting.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return PlatformSetting;
};
