'use strict';

/**
 * facial_verifications — histórico das verificações faciais (KYC).
 * `context` distingue se a verificação é exigida do vendedor (após 1ª venda)
 * ou do comprador (após 1ª compra). O status consolidado fica no User.
 */
module.exports = (sequelize, DataTypes) => {
  const FacialVerification = sequelize.define(
    'FacialVerification',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      context: { type: DataTypes.ENUM('seller', 'buyer'), allowNull: false },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      provider: { type: DataTypes.STRING(60), allowNull: true }, // serviço de biometria
      external_reference: { type: DataTypes.STRING(180), allowNull: true },
      selfie_url: { type: DataTypes.STRING, allowNull: true },
      document_url: { type: DataTypes.STRING, allowNull: true },
      score: { type: DataTypes.DECIMAL(5, 2), allowNull: true },
      rejection_reason: { type: DataTypes.TEXT, allowNull: true },
      reviewed_by: { type: DataTypes.UUID, allowNull: true }, // admin
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'facial_verifications',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['context'] },
        { fields: ['status'] },
      ],
    }
  );

  FacialVerification.associate = (models) => {
    FacialVerification.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    FacialVerification.belongsTo(models.User, { foreignKey: 'reviewed_by', as: 'reviewer' });
  };

  return FacialVerification;
};
