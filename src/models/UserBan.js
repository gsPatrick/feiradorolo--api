'use strict';

/**
 * user_bans — bloqueios/banimentos de usuários (aba Segurança). Suporta bans
 * temporários (com expiração) ou permanentes, e escopo parcial (ex.: só vender).
 */
module.exports = (sequelize, DataTypes) => {
  const UserBan = sequelize.define(
    'UserBan',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      banned_by: { type: DataTypes.UUID, allowNull: true }, // admin
      type: {
        type: DataTypes.ENUM('temporary', 'permanent'),
        allowNull: false,
        defaultValue: 'temporary',
      },
      scope: {
        type: DataTypes.ENUM('full', 'selling', 'buying', 'chat'),
        allowNull: false,
        defaultValue: 'full',
      },
      reason: { type: DataTypes.TEXT, allowNull: true },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true }, // null = permanente
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      lifted_at: { type: DataTypes.DATE, allowNull: true },
      lifted_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'user_bans',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['is_active'] },
        { fields: ['expires_at'] },
      ],
    }
  );

  UserBan.associate = (models) => {
    UserBan.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserBan.belongsTo(models.User, { foreignKey: 'banned_by', as: 'moderator' });
  };

  return UserBan;
};
