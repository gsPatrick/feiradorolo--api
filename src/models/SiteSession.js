'use strict';

/** site_sessions — uma linha por sessão anônima por DIA (presença/visitas). */
module.exports = (sequelize, DataTypes) => {
  const SiteSession = sequelize.define(
    'SiteSession',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      session_id: { type: DataTypes.STRING, allowNull: false }, // id anônimo gerado no front
      user_id: { type: DataTypes.UUID, allowNull: true },
      day: { type: DataTypes.DATEONLY, allowNull: false }, // dia da visita
      first_seen_at: { type: DataTypes.DATE, allowNull: true },
      last_seen_at: { type: DataTypes.DATE, allowNull: true },
      hits: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      path: { type: DataTypes.STRING, allowNull: true },
    },
    {
      tableName: 'site_sessions',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['session_id', 'day'] },
        { fields: ['day'] },
        { fields: ['last_seen_at'] },
      ],
    }
  );

  SiteSession.associate = (models) => {
    SiteSession.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SiteSession;
};
