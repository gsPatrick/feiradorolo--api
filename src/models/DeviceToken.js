'use strict';

/**
 * device_tokens — tokens de dispositivos para push (FCM/OneSignal). Um usuário
 * pode ter vários dispositivos. Usado pela aba Notificações Push.
 */
module.exports = (sequelize, DataTypes) => {
  const DeviceToken = sequelize.define(
    'DeviceToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      token: { type: DataTypes.STRING, allowNull: false, unique: true },
      platform: {
        type: DataTypes.ENUM('android', 'ios', 'web'),
        allowNull: false,
        defaultValue: 'web',
      },
      provider: {
        type: DataTypes.ENUM('fcm', 'onesignal'),
        allowNull: false,
        defaultValue: 'fcm',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      last_used_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'device_tokens',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['user_id'] }, { fields: ['token'] }, { fields: ['is_active'] }],
    }
  );

  DeviceToken.associate = (models) => {
    DeviceToken.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return DeviceToken;
};
