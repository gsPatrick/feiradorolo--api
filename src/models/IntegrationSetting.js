'use strict';

/**
 * integration_settings — credenciais DINÂMICAS e rotacionáveis dos serviços
 * externos (Brevo, Zoho, Firebase, Melhor Envio, FCM, OneSignal). Mesmo padrão
 * de segurança de payment_gateway_settings: configs não-secretas em `config`
 * (JSONB) e segredos cifrados em `credentials_encrypted` (cifragem na camada de
 * service, master key fora do banco), com `key_version` para rotação.
 *
 * Tira do .env tudo que o admin precise rotacionar pelo painel.
 */
module.exports = (sequelize, DataTypes) => {
  const IntegrationSetting = sequelize.define(
    'IntegrationSetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      service: {
        type: DataTypes.ENUM('brevo', 'zoho', 'firebase', 'melhor_envio', 'fcm', 'onesignal', 'resend', 'zapi'),
        allowNull: false,
      },
      environment: {
        type: DataTypes.ENUM('test', 'production'),
        allowNull: false,
        defaultValue: 'production',
      },
      label: { type: DataTypes.STRING(120), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      config: { type: DataTypes.JSONB, allowNull: true }, // host, sender, project_id... (não secreto)
      credentials_encrypted: { type: DataTypes.TEXT, allowNull: true }, // bundle cifrado

      is_encrypted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      key_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      rotated_at: { type: DataTypes.DATE, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'integration_settings',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['service', 'environment'] },
        { fields: ['is_active'] },
      ],
    }
  );

  IntegrationSetting.associate = (models) => {
    IntegrationSetting.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return IntegrationSetting;
};
