'use strict';

/**
 * content_pages — páginas institucionais/informativas totalmente editáveis pelo
 * admin (central de ajuda, FAQ, frete, garantia, quem somos, termos, etc.).
 * `content` (JSONB) guarda a estrutura flexível de seções/FAQ/formulário; o front
 * renderiza dinamicamente e cai num fallback hardcoded se a página não existir.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('content_pages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      slug: { type: Sequelize.STRING(140), allowNull: false, unique: true },
      title: { type: Sequelize.STRING(180), allowNull: false },
      subtitle: { type: Sequelize.STRING(255) },
      kind: { type: Sequelize.ENUM('content', 'faq', 'form'), allowNull: false, defaultValue: 'content' },
      icon: { type: Sequelize.STRING(60) },
      content: { type: Sequelize.JSONB }, // { hero, sections:[], faq:[], form:{} }
      meta: { type: Sequelize.JSONB }, // SEO/extras
      is_published: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      updated_by: {
        type: Sequelize.UUID,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('content_pages', ['slug']);
    await queryInterface.addIndex('content_pages', ['is_published']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('content_pages');
  },
};
