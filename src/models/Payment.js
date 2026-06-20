'use strict';

/**
 * payments — transações de pagamento (Mercado Pago). Registra o split:
 * `platform_fee` (comissão), `gateway_fee` e `net_amount` (vai ao escrow).
 * `payload` guarda o webhook bruto para auditoria/reconciliação.
 */
module.exports = (sequelize, DataTypes) => {
  const Payment = sequelize.define(
    'Payment',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: { type: DataTypes.UUID, allowNull: true }, // null para planos/destaques
      user_id: { type: DataTypes.UUID, allowNull: false }, // pagador

      provider: {
        type: DataTypes.ENUM('mercado_pago'),
        allowNull: false,
        defaultValue: 'mercado_pago',
      },
      external_id: { type: DataTypes.STRING(120), allowNull: true }, // id do pagamento no MP
      preference_id: { type: DataTypes.STRING(120), allowNull: true },

      purpose: {
        type: DataTypes.ENUM('order', 'plan', 'highlight'),
        allowNull: false,
        defaultValue: 'order',
      },
      method: {
        type: DataTypes.ENUM('pix', 'credit_card', 'debit_card', 'boleto', 'account_money'),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM(
          'pending',
          'in_process',
          'authorized',
          'approved',
          'rejected',
          'refunded',
          'cancelled',
          'charged_back'
        ),
        allowNull: false,
        defaultValue: 'pending',
      },

      amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
      currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'BRL' },
      installments: { type: DataTypes.INTEGER, allowNull: true },

      platform_fee: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // comissão (split)
      gateway_fee: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      net_amount: { type: DataTypes.DECIMAL(12, 2), allowNull: true }, // vai p/ escrow

      split: { type: DataTypes.JSONB, allowNull: true },
      payload: { type: DataTypes.JSONB, allowNull: true }, // webhook bruto
      paid_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'payments',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['user_id'] },
        { fields: ['external_id'] },
        { fields: ['status'] },
        { fields: ['purpose'] },
      ],
    }
  );

  Payment.associate = (models) => {
    Payment.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    Payment.belongsTo(models.User, { foreignKey: 'user_id', as: 'payer' });
    Payment.hasOne(models.Escrow, { foreignKey: 'payment_id', as: 'escrow' });
  };

  return Payment;
};
