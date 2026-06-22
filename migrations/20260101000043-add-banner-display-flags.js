'use strict';

/**
 * Flags de exibição do banner:
 * - show_text: se false, mostra SÓ a imagem (sem sobrepor título/subtítulo/CTA).
 * - show_button: se false, não mostra o botão (CTA).
 * - clickable: se true, o banner inteiro vira link (vai para link_url/cta_url).
 *
 * Idempotente: addColumn protegido por try/catch (ignora "já existe").
 * Defaults: banners de imagem com texto embutido na arte
 * ('Ofertas Relâmpago' e 'Vendedores Verificados') ficam com
 * show_text=false, show_button=false, clickable=true.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const cols = {
      show_text: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      show_button: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      clickable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
    };

    for (const [name, spec] of Object.entries(cols)) {
      try {
        await queryInterface.addColumn('banners', name, spec);
      } catch (err) {
        // Coluna já existe — migration idempotente.
        if (!/already exists|duplicate column/i.test(err.message)) throw err;
      }
    }

    // Banners de imagem cuja arte já contém o texto: sem overlay/botão e clicáveis.
    await queryInterface.sequelize.query(
      `UPDATE banners
         SET show_text = false, show_button = false, clickable = true
       WHERE title IN ('Ofertas Relâmpago', 'Vendedores Verificados')
         AND background_type = 'image';`
    );
  },

  async down(queryInterface) {
    for (const col of ['show_text', 'show_button', 'clickable']) {
      await queryInterface.removeColumn('banners', col);
    }
  },
};
