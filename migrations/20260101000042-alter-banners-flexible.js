'use strict';

/**
 * Banners flexíveis — permite ao admin criar banners iguais aos do front:
 * fundo por IMAGEM, COR ou GRADIENTE; título, subtítulo, emoji/ícone, cor do
 * texto, CTA (texto + link), badge, variante e um `content` JSONB livre
 * (decoração lateral do hero, features do app promo, config de timer da flash sale).
 * `image_url` deixa de ser obrigatório. `position` ganha `home_flash` e `app_promo`.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Fundo: imagem, cor sólida ou gradiente.
    await queryInterface.addColumn('banners', 'background_type', {
      type: Sequelize.ENUM('image', 'color', 'gradient'),
      allowNull: false,
      defaultValue: 'image',
    });
    await queryInterface.addColumn('banners', 'background_color', { type: Sequelize.STRING(40), allowNull: true });
    await queryInterface.addColumn('banners', 'background_gradient', { type: Sequelize.STRING(255), allowNull: true });
    await queryInterface.addColumn('banners', 'text_color', { type: Sequelize.STRING(40), allowNull: true });
    await queryInterface.addColumn('banners', 'emoji', { type: Sequelize.STRING(16), allowNull: true });
    await queryInterface.addColumn('banners', 'icon', { type: Sequelize.STRING(60), allowNull: true });
    await queryInterface.addColumn('banners', 'cta_text', { type: Sequelize.STRING(80), allowNull: true });
    await queryInterface.addColumn('banners', 'cta_url', { type: Sequelize.STRING, allowNull: true });
    await queryInterface.addColumn('banners', 'badge_text', { type: Sequelize.STRING(60), allowNull: true });
    await queryInterface.addColumn('banners', 'variant', { type: Sequelize.STRING(40), allowNull: true });
    await queryInterface.addColumn('banners', 'content', { type: Sequelize.JSONB, allowNull: true });

    // image_url passa a ser opcional (fundo pode ser cor/gradiente).
    await queryInterface.changeColumn('banners', 'image_url', { type: Sequelize.STRING, allowNull: true });

    // Novas posições para Flash Sale e App Promo.
    await queryInterface.sequelize.query("ALTER TYPE \"enum_banners_position\" ADD VALUE IF NOT EXISTS 'home_flash';");
    await queryInterface.sequelize.query("ALTER TYPE \"enum_banners_position\" ADD VALUE IF NOT EXISTS 'app_promo';");
  },

  async down(queryInterface) {
    for (const col of [
      'background_type', 'background_color', 'background_gradient', 'text_color',
      'emoji', 'icon', 'cta_text', 'cta_url', 'badge_text', 'variant', 'content',
    ]) {
      await queryInterface.removeColumn('banners', col);
    }
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_banners_background_type";');
    // Valores adicionados ao enum de position não são removidos (limitação do Postgres).
  },
};
