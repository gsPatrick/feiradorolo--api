'use strict';

/**
 * Content page da vertical IMÓVEIS (slug `imoveis`): hero editável pelo admin em
 * "Páginas & FAQ". `content.hero.image_url` nasce vazio — o cliente coloca a
 * imagem depois pelo painel.
 *
 * Idempotente: ON CONFLICT (slug) preserva edições do admin (NÃO sobrescreve o
 * content nem o título já existentes; apenas garante a criação inicial).
 */
const { randomUUID } = require('crypto');

const SLUG = 'imoveis';
const CONTENT = {
  hero: {
    title: 'Imóveis',
    subtitle: 'Seu descanso merecido',
    image_url: '',
  },
};

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date();

    await seq.query(
      `INSERT INTO content_pages
         (id, slug, title, subtitle, kind, content, is_published, sort_order,
          created_at, updated_at)
       VALUES
         (:id, :slug, :title, :subtitle, 'content', :content, true, :sort,
          :now, :now)
       ON CONFLICT (slug) DO NOTHING`,
      {
        replacements: {
          id: randomUUID(),
          slug: SLUG,
          title: 'Imóveis',
          subtitle: 'Seu descanso merecido',
          content: JSON.stringify(CONTENT),
          sort: 50,
          now,
        },
      }
    );
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    await seq.query(`DELETE FROM content_pages WHERE slug = :slug`, { replacements: { slug: SLUG } });
  },
};
