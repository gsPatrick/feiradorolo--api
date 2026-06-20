'use strict';

/**
 * payment_gateway_settings — credenciais OPERACIONAIS do gateway, rotacionáveis
 * pelo admin (não dependem do .env). Separada de platform_settings por ser
 * altamente sensível.
 *
 * Segurança: os segredos (access_token, client_secret, webhook_secret) são
 * armazenados em colunas `*_encrypted` (ciphertext). A criptografia/decriptação
 * é responsabilidade da camada de service (a ser implementada), usando uma
 * master key fora do banco; `key_version` suporta rotação. A `public_key` não é
 * secreta. Há uma linha por (provider, environment); `is_active` indica qual
 * ambiente está em uso.
 */
module.exports = (sequelize, DataTypes) => {
  const PaymentGatewaySetting = sequelize.define(
    'PaymentGatewaySetting',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      provider: {
        type: DataTypes.ENUM('mercado_pago'),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      environment: {
        type: DataTypes.ENUM('test', 'production'),
        allowNull: false,
        defaultValue: 'test',
      },
      label: { type: DataTypes.STRING(120), allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      // Credenciais.
      public_key: { type: DataTypes.STRING, allowNull: true }, // não secreto
      access_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
      client_id: { type: DataTypes.STRING, allowNull: true },
      client_secret_encrypted: { type: DataTypes.TEXT, allowNull: true },
      webhook_secret_encrypted: { type: DataTypes.TEXT, allowNull: true },
      extra_encrypted: { type: DataTypes.TEXT, allowNull: true }, // JSON extra (cifrado)

      // Metadados de segurança / rotação.
      is_encrypted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      key_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      rotated_at: { type: DataTypes.DATE, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'payment_gateway_settings',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['provider', 'environment'] },
        { fields: ['is_active'] },
      ],
    }
  );

  PaymentGatewaySetting.associate = (models) => {
    PaymentGatewaySetting.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return PaymentGatewaySetting;
};
