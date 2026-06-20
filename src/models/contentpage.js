'use strict';

/**
 * content_pages — páginas informativas/institucionais editáveis pelo admin.
 * `content` (JSONB) é a estrutura flexível renderizada pelo front.
 */
module.exports = (sequelize, DataTypes) => {
  const ContentPage = sequelize.define(
    'ContentPage',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      slug: { type: DataTypes.STRING(140), allowNull: false, unique: true },
      title: { type: DataTypes.STRING(180), allowNull: false },
      subtitle: { type: DataTypes.STRING(255), allowNull: true },
      kind: { type: DataTypes.ENUM('content', 'faq', 'form'), allowNull: false, defaultValue: 'content' },
      icon: { type: DataTypes.STRING(60), allowNull: true },
      content: { type: DataTypes.JSONB, allowNull: true },
      meta: { type: DataTypes.JSONB, allowNull: true },
      is_published: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      updated_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'content_pages',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['slug'] }, { fields: ['is_published'] }],
    }
  );

  ContentPage.associate = (models) => {
    ContentPage.belongsTo(models.User, { foreignKey: 'updated_by', as: 'editor' });
  };

  return ContentPage;
};
