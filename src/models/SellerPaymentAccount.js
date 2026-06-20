'use strict';

/**
 * seller_payment_accounts — vínculo OAuth do vendedor com o gateway (Mercado
 * Pago Connect/Marketplace). Guarda o access_token/refresh_token do VENDEDOR
 * (cifrados) usados para criar pagamentos com SPLIT/repasse nativo: o pagamento
 * é criado com o token do vendedor + application_fee/marketplace_fee (comissão),
 * e o Mercado Pago repassa o líquido direto para a conta dele.
 *
 * Token de acesso expira em ~180 dias; `expires_at` aciona o refresh.
 */
module.exports = (sequelize, DataTypes) => {
  const SellerPaymentAccount = sequelize.define(
    'SellerPaymentAccount',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false }, // vendedor
      provider: { type: DataTypes.ENUM('mercado_pago'), allowNull: false, defaultValue: 'mercado_pago' },

      mp_user_id: { type: DataTypes.STRING(60), allowNull: true }, // = collector_id que recebe
      public_key: { type: DataTypes.STRING, allowNull: true },
      access_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
      refresh_token_encrypted: { type: DataTypes.TEXT, allowNull: true },
      scope: { type: DataTypes.STRING(255), allowNull: true },

      status: {
        type: DataTypes.ENUM('pending', 'linked', 'expired', 'revoked'),
        allowNull: false,
        defaultValue: 'pending',
      },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
      linked_at: { type: DataTypes.DATE, allowNull: true },
      key_version: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      raw: { type: DataTypes.JSONB, allowNull: true }, // metadados não-secretos
    },
    {
      tableName: 'seller_payment_accounts',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['user_id', 'provider'] },
        { fields: ['mp_user_id'] },
        { fields: ['status'] },
        { fields: ['is_active'] },
      ],
    }
  );

  SellerPaymentAccount.associate = (models) => {
    SellerPaymentAccount.belongsTo(models.User, { foreignKey: 'user_id', as: 'seller' });
  };

  return SellerPaymentAccount;
};
