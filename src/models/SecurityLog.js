'use strict';

/**
 * security_logs — trilha de auditoria (aba Auditoria do admin). Registra ações
 * sensíveis: login, alterações de configuração, bans, liberação de escrow, etc.
 */
module.exports = (sequelize, DataTypes) => {
  const SecurityLog = sequelize.define(
    'SecurityLog',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: true }, // ator (null = sistema)
      action: { type: DataTypes.STRING(120), allowNull: false }, // ex.: 'user.login'
      entity_type: { type: DataTypes.STRING(80), allowNull: true }, // ex.: 'order'
      entity_id: { type: DataTypes.STRING(80), allowNull: true },
      severity: {
        type: DataTypes.ENUM('info', 'warning', 'critical'),
        allowNull: false,
        defaultValue: 'info',
      },
      status: {
        type: DataTypes.ENUM('success', 'failure'),
        allowNull: false,
        defaultValue: 'success',
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      ip_address: { type: DataTypes.STRING(45), allowNull: true },
      user_agent: { type: DataTypes.STRING, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'security_logs',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['action'] },
        { fields: ['severity'] },
        { fields: ['entity_type', 'entity_id'] },
        { fields: ['created_at'] },
      ],
    }
  );

  SecurityLog.associate = (models) => {
    SecurityLog.belongsTo(models.User, { foreignKey: 'user_id', as: 'actor' });
  };

  return SecurityLog;
};
