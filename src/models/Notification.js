'use strict';

/**
 * notifications — notificações in-app/push/e-mail (aba Notificações Push do
 * admin). `provider` prepara a futura integração com FCM/OneSignal.
 */
module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    'Notification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false }, // destinatário
      type: { type: DataTypes.STRING(80), allowNull: false }, // ex.: 'order.paid'
      channel: {
        type: DataTypes.ENUM('push', 'in_app', 'email'),
        allowNull: false,
        defaultValue: 'in_app',
      },
      title: { type: DataTypes.STRING(180), allowNull: false },
      body: { type: DataTypes.TEXT, allowNull: true },
      data: { type: DataTypes.JSONB, allowNull: true }, // payload/deeplink
      provider: { type: DataTypes.ENUM('fcm', 'onesignal', 'internal'), allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'read'),
        allowNull: false,
        defaultValue: 'pending',
      },
      sent_at: { type: DataTypes.DATE, allowNull: true },
      read_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'notifications',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['status'] },
        { fields: ['type'] },
        { fields: ['channel'] },
      ],
    }
  );

  Notification.associate = (models) => {
    Notification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Notification;
};
