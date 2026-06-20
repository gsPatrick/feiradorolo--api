'use strict';

/**
 * Precificação de publicação por categoria (regras/3). Resolve o category_id
 * pelo slug das categorias semeadas. Imóveis/Veículos exigem plano (package);
 * Serviços e Causa Animal são gratuitos; Produtos Gerais cobram via comissão.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [cats] = await queryInterface.sequelize.query('SELECT id, slug FROM categories;');
    const bySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]));

    const config = {
      'produtos-gerais': { pricing_model: 'commission', listing_fee: 0, requires_plan: false },
      imoveis: { pricing_model: 'package', listing_fee: 0, requires_plan: true },
      veiculos: { pricing_model: 'package', listing_fee: 0, requires_plan: true },
      servicos: { pricing_model: 'free', listing_fee: 0, requires_plan: false },
      'causa-animal': { pricing_model: 'free', listing_fee: 0, requires_plan: false },
    };

    const rows = Object.entries(config)
      .filter(([slug]) => bySlug[slug])
      .map(([slug, c]) => ({
        id: randomUUID(),
        category_id: bySlug[slug],
        pricing_model: c.pricing_model,
        listing_fee: c.listing_fee,
        currency: 'BRL',
        requires_plan: c.requires_plan,
        is_active: true,
        created_at: now,
        updated_at: now,
      }));

    if (rows.length) await queryInterface.bulkInsert('category_pricing', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('category_pricing', null, {});
  },
};
