'use strict';

/**
 * Categorias de NEGÓCIO da Feira do Rolo (regras/3) + planos vinculados.
 * Diferente da árvore importada (catálogo), estas são as categorias com regras:
 *   - Imóveis / Veículos  → exigem PLANO ativo (package) + plano mensal vinculado
 *   - Causa Animal        → grátis + geolocalização obrigatória (free_geo)
 *   - Serviços            → grátis (free)
 * Idempotente (ON CONFLICT por slug / category_id) — seguro re-rodar.
 */
const { randomUUID } = require('crypto');

const CATS = [
  { slug: 'imoveis', name: 'Imóveis', monetization_model: 'package', geo: false, pricing_model: 'package', requires_plan: true, plan: 'Plano Imóveis — Mensal' },
  { slug: 'veiculos', name: 'Veículos', monetization_model: 'package', geo: false, pricing_model: 'package', requires_plan: true, plan: 'Plano Veículos — Mensal' },
  { slug: 'servicos-fdr', name: 'Serviços', monetization_model: 'free', geo: false, pricing_model: 'free', requires_plan: false, plan: null },
  { slug: 'causa-animal', name: 'Causa Animal', monetization_model: 'free_geo', geo: true, pricing_model: 'free', requires_plan: false, plan: null },
];

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date();

    for (const c of CATS) {
      // Categoria (idempotente por slug).
      await seq.query(
        `INSERT INTO categories (id, name, slug, parent_id, monetization_model, requires_geolocation, is_active, created_at, updated_at)
         VALUES (:id, :name, :slug, NULL, :mon, :geo, true, :now, :now)
         ON CONFLICT (slug) DO UPDATE SET monetization_model = EXCLUDED.monetization_model, requires_geolocation = EXCLUDED.requires_geolocation, updated_at = :now`,
        { replacements: { id: randomUUID(), name: c.name, slug: c.slug, mon: c.monetization_model, geo: c.geo, now } }
      );

      const [[cat]] = await seq.query('SELECT id FROM categories WHERE slug = :slug', { replacements: { slug: c.slug } });
      const categoryId = cat.id;

      // Precificação/regra da categoria (idempotente por category_id).
      await seq.query(
        `INSERT INTO category_pricing (id, category_id, pricing_model, requires_plan, is_active, created_at, updated_at)
         VALUES (:id, :cid, :pm, :rp, true, :now, :now)
         ON CONFLICT (category_id) DO UPDATE SET pricing_model = EXCLUDED.pricing_model, requires_plan = EXCLUDED.requires_plan, updated_at = :now`,
        { replacements: { id: randomUUID(), cid: categoryId, pm: c.pricing_model, rp: c.requires_plan, now } }
      );

      // Plano mensal vinculado às categorias que exigem plano.
      if (c.plan) {
        const planSlug = `plano-${c.slug}-mensal`;
        await seq.query(
          `INSERT INTO plans (id, name, slug, type, category_id, price, currency, duration_days, listing_limit, is_active, created_at, updated_at)
           VALUES (:id, :name, :slug, 'category_package', :cid, 79.90, 'BRL', 30, 30, true, :now, :now)
           ON CONFLICT (slug) DO UPDATE SET category_id = EXCLUDED.category_id, is_active = true, updated_at = :now`,
          { replacements: { id: randomUUID(), name: c.plan, slug: planSlug, cid: categoryId, now } }
        );
      }
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    await seq.query("DELETE FROM plans WHERE slug IN ('plano-imoveis-mensal', 'plano-veiculos-mensal')");
    await seq.query("DELETE FROM category_pricing WHERE category_id IN (SELECT id FROM categories WHERE slug IN ('imoveis','veiculos','servicos-fdr','causa-animal'))");
    await seq.query("DELETE FROM categories WHERE slug IN ('imoveis','veiculos','servicos-fdr','causa-animal')");
  },
};
