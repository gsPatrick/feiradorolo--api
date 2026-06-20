'use strict';

/**
 * disputes — disputas de pedidos (aba Pedidos do admin: "falta conectar
 * disputas"). Bloqueiam a liberação do escrow enquanto abertas.
 */
module.exports = (sequelize, DataTypes) => {
  const Dispute = sequelize.define(
    'Dispute',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      order_id: { type: DataTypes.UUID, allowNull: false },
      opened_by: { type: DataTypes.UUID, allowNull: false }, // normalmente o comprador
      against_id: { type: DataTypes.UUID, allowNull: false }, // contraparte (vendedor)
      reason: {
        type: DataTypes.ENUM('not_received', 'not_as_described', 'damaged', 'fraud', 'other'),
        allowNull: false,
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.ENUM(
          'open',
          'under_review',
          'awaiting_response',
          'resolved',
          'rejected',
          'cancelled'
        ),
        allowNull: false,
        defaultValue: 'open',
      },
      resolution: {
        type: DataTypes.ENUM('refund_buyer', 'release_seller', 'partial_refund', 'none'),
        allowNull: true,
      },
      resolution_notes: { type: DataTypes.TEXT, allowNull: true },
      amount_disputed: { type: DataTypes.DECIMAL(12, 2), allowNull: true },
      evidence: { type: DataTypes.JSONB, allowNull: true }, // array de URLs/anexos
      assigned_admin_id: { type: DataTypes.UUID, allowNull: true },
      resolved_by: { type: DataTypes.UUID, allowNull: true },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'disputes',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['order_id'] },
        { fields: ['opened_by'] },
        { fields: ['against_id'] },
        { fields: ['status'] },
      ],
    }
  );

  Dispute.associate = (models) => {
    Dispute.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    Dispute.belongsTo(models.User, { foreignKey: 'opened_by', as: 'claimant' });
    Dispute.belongsTo(models.User, { foreignKey: 'against_id', as: 'respondent' });
    Dispute.belongsTo(models.User, { foreignKey: 'assigned_admin_id', as: 'admin' });
  };

  return Dispute;
};
