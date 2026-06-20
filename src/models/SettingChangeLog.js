'use strict';

/**
 * setting_change_logs — trilha de auditoria específica das configurações da
 * plataforma. Guarda valor anterior e novo (JSONB) para auditoria e para
 * suportar rollback/"restaurar padrões". Complementa security_logs.
 */
module.exports = (sequelize, DataTypes) => {
  const SettingChangeLog = sequelize.define(
    'SettingChangeLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      entity: {
        type: DataTypes.ENUM(
          'platform_setting',
          'commission_rule',
          'shipping_setting',
          'highlight_package',
          'category_pricing',
          'payment_gateway'
        ),
        allowNull: false,
      },
      entity_id: { type: DataTypes.STRING(80), allowNull: true },
      setting_key: { type: DataTypes.STRING(120), allowNull: true },
      action: {
        type: DataTypes.ENUM('create', 'update', 'delete', 'restore_default'),
        allowNull: false,
        defaultValue: 'update',
      },
      old_value: { type: DataTypes.JSONB, allowNull: true }, // segredos NUNCA em claro aqui
      new_value: { type: DataTypes.JSONB, allowNull: true },
      changed_by: { type: DataTypes.UUID, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'setting_change_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['entity'] },
        { fields: ['entity_id'] },
        { fields: ['changed_by'] },
        { fields: ['created_at'] },
      ],
    }
  );

  SettingChangeLog.associate = (models) => {
    SettingChangeLog.belongsTo(models.User, { foreignKey: 'changed_by', as: 'editor' });
  };

  return SettingChangeLog;
};
