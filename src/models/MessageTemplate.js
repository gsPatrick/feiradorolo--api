'use strict';

/**
 * message_templates — templates editáveis pelo admin para e-mail, push, in-app e
 * sms (abas Emails e Notificações Push). `key` é o evento (ex.: 'order.paid'); o
 * corpo usa placeholders (ex.: {{buyer_name}}) declarados em `variables`. Um
 * template por (key, channel, locale).
 */
module.exports = (sequelize, DataTypes) => {
  const MessageTemplate = sequelize.define(
    'MessageTemplate',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: { type: DataTypes.STRING(120), allowNull: false }, // evento
      channel: {
        type: DataTypes.ENUM('email', 'push', 'in_app', 'sms'),
        allowNull: false,
      },
      locale: { type: DataTypes.STRING(5), allowNull: false, defaultValue: 'pt-BR' },
      name: { type: DataTypes.STRING(120), allowNull: false },
      subject: { type: DataTypes.STRING(200), allowNull: true }, // e-mail
      title: { type: DataTypes.STRING(180), allowNull: true }, // push/in-app
      body: { type: DataTypes.TEXT, allowNull: false },
      variables: { type: DataTypes.JSONB, allowNull: true }, // placeholders declarados
      provider: {
        type: DataTypes.ENUM('brevo', 'zoho', 'fcm', 'onesignal', 'internal'),
        allowNull: true,
      },
      is_transactional: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'message_templates',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['key', 'channel', 'locale'] },
        { fields: ['channel'] },
        { fields: ['is_active'] },
      ],
    }
  );

  MessageTemplate.associate = (models) => {
    MessageTemplate.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return MessageTemplate;
};
