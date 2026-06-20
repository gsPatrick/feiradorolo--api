'use strict';

/** Perguntas & respostas demo para a página de produto não ficar vazia. */
const { randomUUID } = require('crypto');

const QA = [
  { question: 'Esse produto tem garantia? Quanto tempo?', answer: 'Sim! Acompanha 90 dias de garantia contra defeitos de fabricação.' },
  { question: 'Vocês enviam para todo o Brasil?', answer: 'Enviamos para todo o Brasil via Correios e transportadora.' },
  { question: 'O produto é original e lacrado?', answer: null },
  { question: 'Aceita parcelamento sem juros?', answer: 'Sim, em até 12x sem juros no cartão pelo Mercado Pago.' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[user]] = await queryInterface.sequelize.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1;');
    if (!user) return;
    const [products] = await queryInterface.sequelize.query('SELECT id FROM products ORDER BY created_at ASC LIMIT 6;');
    if (!products.length) return;

    const rows = [];
    products.forEach((p, pi) => {
      // 2 perguntas por produto (alternando do banco QA).
      for (let i = 0; i < 2; i++) {
        const qa = QA[(pi + i) % QA.length];
        const answered = !!qa.answer;
        rows.push({
          id: randomUUID(),
          product_id: p.id,
          user_id: user.id,
          question: qa.question,
          answer: qa.answer,
          answered_at: answered ? now : null,
          answered_by: answered ? user.id : null,
          status: answered ? 'answered' : 'pending',
          created_at: now,
          updated_at: now,
        });
      }
    });
    await queryInterface.bulkInsert('product_questions', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('product_questions', null, {});
  },
};
