'use strict';

/**
 * blocked_words — palavras/termos bloqueados (aba Segurança). Usados na
 * moderação de chat, produtos e avaliações. Suporta regex e ações distintas.
 */
module.exports = (sequelize, DataTypes) => {
  const BlockedWord = sequelize.define(
    'BlockedWord',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      word: { type: DataTypes.STRING(120), allowNull: false, unique: true },
      severity: {
        type: DataTypes.ENUM('low', 'medium', 'high'),
        allowNull: false,
        defaultValue: 'medium',
      },
      action: {
        type: DataTypes.ENUM('flag', 'block', 'mask'),
        allowNull: false,
        defaultValue: 'flag',
      },
      scope: {
        type: DataTypes.ENUM('all', 'chat', 'product', 'review'),
        allowNull: false,
        defaultValue: 'all',
      },
      is_regex: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'blocked_words',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['word'] }, { fields: ['scope'] }, { fields: ['is_active'] }],
    }
  );

  BlockedWord.associate = (models) => {
    BlockedWord.belongsTo(models.User, { foreignKey: 'created_by', as: 'author' });
  };

  return BlockedWord;
};
