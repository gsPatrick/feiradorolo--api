'use strict';

/**
 * token_blacklist — tokens JWT revogados (logout / invalidação forçada).
 * Consultada no middleware de auth. `expires_at` permite limpeza periódica.
 */
module.exports = (sequelize, DataTypes) => {
  const TokenBlacklist = sequelize.define(
    'TokenBlacklist',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      jti: { type: DataTypes.STRING(128), allowNull: true }, // id do token, se houver
      token: { type: DataTypes.TEXT, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: true },
      reason: { type: DataTypes.STRING(120), allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: false },
    },
    {
      tableName: 'token_blacklist',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { fields: ['jti'] },
        { fields: ['user_id'] },
        { fields: ['expires_at'] },
      ],
    }
  );

  TokenBlacklist.associate = (models) => {
    TokenBlacklist.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return TokenBlacklist;
};
