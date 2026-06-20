'use strict';

/**
 * reports — denúncias de conteúdo feitas por usuários (perguntas, mensagens,
 * produtos, avaliações, etc.). O admin trata na aba Chat/Moderação → Denúncias.
 * `snapshot` guarda o contexto (texto, autor, produto) para o admin ver sem joins.
 */
module.exports = (sequelize, DataTypes) => {
  const Report = sequelize.define(
    'Report',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      reporter_id: { type: DataTypes.UUID, allowNull: true },
      target_type: {
        type: DataTypes.ENUM('question', 'message', 'product', 'review', 'user', 'chat'),
        allowNull: false,
      },
      target_id: { type: DataTypes.UUID, allowNull: false },
      reason: {
        type: DataTypes.ENUM('spam', 'offensive', 'inappropriate', 'fraud', 'external_contact', 'other'),
        allowNull: false,
        defaultValue: 'other',
      },
      description: { type: DataTypes.TEXT, allowNull: true },
      snapshot: { type: DataTypes.JSONB, allowNull: true },
      status: {
        type: DataTypes.ENUM('pending', 'approved', 'rejected'),
        allowNull: false,
        defaultValue: 'pending',
      },
      resolution: { type: DataTypes.TEXT, allowNull: true },
      resolved_by: { type: DataTypes.UUID, allowNull: true },
      resolved_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'reports',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['status'] }, { fields: ['target_type'] }, { fields: ['reporter_id'] }],
    }
  );

  Report.associate = (models) => {
    Report.belongsTo(models.User, { foreignKey: 'reporter_id', as: 'reporter' });
  };

  return Report;
};
