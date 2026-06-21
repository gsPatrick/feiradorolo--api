'use strict';

/** verification_codes — códigos de verificação de e-mail e telefone (hash sha256). */
module.exports = (sequelize, DataTypes) => {
  const VerificationCode = sequelize.define(
    'VerificationCode',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      channel: { type: DataTypes.ENUM('email', 'phone'), allowNull: false },
      code_hash: { type: DataTypes.STRING, allowNull: false },
      expires_at: { type: DataTypes.DATE, allowNull: false },
      attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      consumed_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'verification_codes',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['user_id'] }, { fields: ['channel'] }],
    }
  );

  VerificationCode.associate = (models) => {
    VerificationCode.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return VerificationCode;
};
