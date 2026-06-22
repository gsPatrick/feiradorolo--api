'use strict';

/**
 * banners — vitrine/marketing gerenciável pelo admin (carrosséis da home,
 * topo de categoria, sidebar). Suporta agendamento (starts_at/ends_at) e
 * métricas básicas de impressão/clique.
 */
module.exports = (sequelize, DataTypes) => {
  const Banner = sequelize.define(
    'Banner',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      title: { type: DataTypes.STRING(180), allowNull: false },
      subtitle: { type: DataTypes.STRING(180), allowNull: true },
      // Fundo: imagem, cor sólida ou gradiente.
      background_type: {
        type: DataTypes.ENUM('image', 'color', 'gradient'),
        allowNull: false,
        defaultValue: 'image',
      },
      image_url: { type: DataTypes.STRING, allowNull: true }, // opcional (fundo pode ser cor/gradiente)
      background_color: { type: DataTypes.STRING(40), allowNull: true },
      background_gradient: { type: DataTypes.STRING(255), allowNull: true },
      text_color: { type: DataTypes.STRING(40), allowNull: true },
      emoji: { type: DataTypes.STRING(16), allowNull: true },
      icon: { type: DataTypes.STRING(60), allowNull: true }, // nome do ícone
      link_url: { type: DataTypes.STRING, allowNull: true },
      cta_text: { type: DataTypes.STRING(80), allowNull: true },
      cta_url: { type: DataTypes.STRING, allowNull: true },
      badge_text: { type: DataTypes.STRING(60), allowNull: true },
      variant: { type: DataTypes.STRING(40), allowNull: true }, // hero | flash_sale | strip | app_promo
      content: { type: DataTypes.JSONB, allowNull: true }, // extras livres (decoração, features, timer)
      // Flags de exibição:
      show_text: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // false = só imagem (sem overlay de texto/CTA)
      show_button: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }, // false = sem botão (CTA)
      clickable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // true = banner inteiro é link (link_url/cta_url)
      position: {
        type: DataTypes.ENUM('home_hero', 'home_strip', 'category_top', 'sidebar', 'home_flash', 'app_promo'),
        allowNull: false,
        defaultValue: 'home_hero',
      },
      category_id: { type: DataTypes.UUID, allowNull: true }, // segmentação opcional
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      starts_at: { type: DataTypes.DATE, allowNull: true },
      ends_at: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      impressions_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      clicks_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      created_by: { type: DataTypes.UUID, allowNull: true },
    },
    {
      tableName: 'banners',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['position'] },
        { fields: ['is_active'] },
        { fields: ['category_id'] },
        { fields: ['sort_order'] },
      ],
    }
  );

  Banner.associate = (models) => {
    Banner.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
    Banner.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
  };

  return Banner;
};
