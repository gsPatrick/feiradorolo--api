'use strict';

/** Favoritos e avaliações demo (super admin) para o catálogo não ficar vazio. */
const { randomUUID } = require('crypto');

const COMMENTS = [
  { rating: 5, title: 'Excelente!', comment: 'Produto chegou rápido e exatamente como descrito. Recomendo muito.' },
  { rating: 4, title: 'Muito bom', comment: 'Ótima qualidade pelo preço. Só a embalagem que poderia ser melhor.' },
  { rating: 5, title: 'Superou expectativas', comment: 'Melhor que eu imaginava, vendedor super atencioso.' },
  { rating: 4, title: 'Recomendo', comment: 'Funciona perfeitamente, entrega dentro do prazo.' },
  { rating: 3, title: 'Razoável', comment: 'Cumpre o que promete, mas esperava um pouco mais.' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[user]] = await queryInterface.sequelize.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1;');
    if (!user) return;
    const [products] = await queryInterface.sequelize.query('SELECT id FROM products ORDER BY created_at ASC LIMIT 8;');
    if (!products.length) return;

    // Favoritos: 4 primeiros produtos.
    const favs = products.slice(0, 4).map((p) => ({
      id: randomUUID(), user_id: user.id, product_id: p.id, created_at: now, updated_at: now,
    }));
    await queryInterface.bulkInsert('favorites', favs);

    // Avaliações: 5 primeiros produtos, 1 review cada.
    const reviews = products.slice(0, 5).map((p, i) => ({
      id: randomUUID(),
      product_id: p.id,
      user_id: user.id,
      order_id: null,
      rating: COMMENTS[i].rating,
      title: COMMENTS[i].title,
      comment: COMMENTS[i].comment,
      images: null,
      status: 'approved',
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('reviews', reviews);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('reviews', null, {});
    await queryInterface.bulkDelete('favorites', null, {});
  },
};
