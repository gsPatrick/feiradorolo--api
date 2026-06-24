'use strict';

/**
 * Produtos demo da vertical IMÓVEIS (categoria `imoveis`), com specifications
 * preenchidas (operacao/tipo_imovel/quartos/banheiros/vagas/area_total) e
 * city/state, para que a busca por specs e por localização retorne resultados.
 * Vendedor = admin (super admin / primeiro usuário).
 *
 * Idempotente: cada imóvel tem slug estável (imovel-demo-N) e usa
 * UPDATE-then-INSERT pelo slug para não duplicar em re-execuções.
 */
const { randomUUID } = require('crypto');

const IMG = 'https://images.unsplash.com/photo-1568605114967-8130f3a36994?q=80&w=900&auto=format&fit=crop';

// title, operacao, tipo, quartos, banheiros, vagas, area_total, condicao,
// city, state, price, lat, lng
const DATA = [
  ['Apartamento 2 quartos no Centro', 'Venda', 'Apartamento', '2', '1', '1', '62', 'Usado', 'São Paulo', 'SP', 390000, -23.5505, -46.6333],
  ['Casa 3 quartos com piscina', 'Venda', 'Casa', '3', '2', '2', '180', 'Usado', 'Campinas', 'SP', 550000, -22.9099, -47.0626],
  ['Cobertura 3 suítes vista mar', 'Venda', 'Apartamento', '3', '3', '2', '210', 'Novo', 'Rio de Janeiro', 'RJ', 1850000, -22.9711, -43.1822],
  ['Chácara para temporada', 'Temporada', 'Chácara', '4', '3', '4', '5000', 'Usado', 'Atibaia', 'SP', 900, -23.1171, -46.5503],
  ['Apartamento 1 quarto para alugar', 'Aluguel', 'Apartamento', '1', '1', '0', '38', 'Usado', 'Belo Horizonte', 'MG', 1600, -19.9167, -43.9345],
  ['Casa 2 quartos em condomínio', 'Aluguel', 'Casa', '2', '2', '2', '120', 'Usado', 'Curitiba', 'PR', 2800, -25.4284, -49.2733],
  ['Terreno 360m² em loteamento', 'Venda', 'Terreno', null, null, null, '360', 'Novo', 'Goiânia', 'GO', 230000, -16.6869, -49.2648],
  ['Sala Comercial no centro empresarial', 'Aluguel', 'Sala Comercial', null, '1', '1', '45', 'Novo', 'São Paulo', 'SP', 3500, -23.5614, -46.6559],
  ['Sítio com lago e pomar', 'Venda', 'Sítio', '3', '2', '5+', '20000', 'Usado', 'Sorocaba', 'SP', 780000, -23.5015, -47.4526],
  ['Flat mobiliado para temporada', 'Temporada', 'Flat/Apart Hotel', '1', '1', '1', '40', 'Usado', 'Rio de Janeiro', 'RJ', 320, -22.9838, -43.2096],
];

module.exports = {
  async up(queryInterface) {
    const seq = queryInterface.sequelize;
    const now = new Date();

    const [[seller]] = await seq.query(
      "SELECT id FROM users WHERE email = 'admin@feiradorolo.com' LIMIT 1;"
    );
    let sellerId = seller ? seller.id : null;
    if (!sellerId) {
      const [[anyUser]] = await seq.query('SELECT id FROM users ORDER BY created_at ASC LIMIT 1;');
      if (!anyUser) return;
      sellerId = anyUser.id;
    }

    const [[cat]] = await seq.query("SELECT id FROM categories WHERE slug = 'imoveis' LIMIT 1;");
    if (!cat) return;

    // Imóveis exige plano ativo (category_pricing.requires_plan = true); sem ele o
    // job de scheduler pausa os anúncios. Garante uma assinatura ATIVA do plano de
    // Imóveis (ou global) para o vendedor demo, para os demos ficarem publicados.
    const [[plan]] = await seq.query(
      `SELECT id, duration_days FROM plans
         WHERE is_active = true AND (category_id = :cid OR category_id IS NULL)
         ORDER BY (category_id = :cid) DESC, price ASC LIMIT 1`,
      { replacements: { cid: cat.id } }
    );
    if (plan) {
      const startsAt = now;
      const endsAt = new Date(now.getTime() + (Number(plan.duration_days) || 30) * 24 * 60 * 60 * 1000);
      const [existing] = await seq.query(
        `SELECT id FROM plan_subscriptions
           WHERE user_id = :uid AND plan_id = :pid AND status = 'active' LIMIT 1`,
        { replacements: { uid: sellerId, pid: plan.id } }
      );
      if (existing.length) {
        await seq.query(
          `UPDATE plan_subscriptions SET starts_at = :s, ends_at = :e, updated_at = :now
             WHERE id = :id`,
          { replacements: { id: existing[0].id, s: startsAt, e: endsAt, now } }
        );
      } else {
        await seq.query(
          `INSERT INTO plan_subscriptions
             (id, user_id, plan_id, status, starts_at, ends_at, listings_used,
              auto_renew, metadata, created_at, updated_at)
           VALUES
             (:id, :uid, :pid, 'active', :s, :e, 0, false, :meta, :now, :now)`,
          {
            replacements: {
              id: randomUUID(), uid: sellerId, pid: plan.id,
              s: startsAt, e: endsAt, meta: JSON.stringify({ source: 'imoveis-demo-seed' }), now,
            },
          }
        );
      }
    }

    let i = 0;
    for (const d of DATA) {
      const [title, operacao, tipo, quartos, banheiros, vagas, areaTotal, condicao, city, state, price, lat, lng] = d;
      i += 1;
      const slug = `imovel-demo-${i}`;
      const specifications = {
        operacao,
        tipo_imovel: tipo,
        area_total: areaTotal,
        condicao,
      };
      if (quartos != null) specifications.quartos = quartos;
      if (banheiros != null) specifications.banheiros = banheiros;
      if (vagas != null) specifications.vagas = vagas;

      const opLabel = operacao === 'Venda' ? 'Venda' : operacao === 'Aluguel' ? 'Aluguel mensal' : 'Diária (temporada)';
      const descr = `${title} em ${city}/${state}. ${tipo} para ${operacao.toLowerCase()}` +
        `${areaTotal ? `, ${areaTotal} m²` : ''}. ${opLabel}. Negócio protegido pela Feira do Rolo.`;

      const [, updateMeta] = await seq.query(
        `UPDATE products SET
           category_id = :cid, title = :title, description = :descr, price = :price,
           condition = NULL, stock = 1, status = 'active',
           specifications = :specs, images = :images, cover_image_url = :cover,
           city = :city, state = :state, latitude = :lat, longitude = :lng,
           metadata = :meta, updated_at = :now, deleted_at = NULL
         WHERE slug = :slug`,
        {
          replacements: {
            cid: cat.id, title, descr, price, slug,
            specs: JSON.stringify(specifications),
            images: JSON.stringify([IMG]), cover: IMG,
            city, state, lat, lng,
            meta: JSON.stringify({ vertical: 'imoveis' }),
            now,
          },
        }
      );
      if (updateMeta && updateMeta.rowCount > 0) continue;

      await seq.query(
        `INSERT INTO products
           (id, seller_id, category_id, title, slug, description, price,
            currency, stock, status, highlight_tier, requires_shipping,
            specifications, images, cover_image_url, city, state, latitude, longitude,
            metadata, views_count, favorites_count, published_at, created_at, updated_at)
         VALUES
           (:id, :sid, :cid, :title, :slug, :descr, :price,
            'BRL', 1, 'active', 'none', false,
            :specs, :images, :cover, :city, :state, :lat, :lng,
            :meta, 0, 0, :now, :now, :now)`,
        {
          replacements: {
            id: randomUUID(), sid: sellerId, cid: cat.id, title, slug, descr, price,
            specs: JSON.stringify(specifications),
            images: JSON.stringify([IMG]), cover: IMG,
            city, state, lat, lng,
            meta: JSON.stringify({ vertical: 'imoveis' }),
            now,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    await seq.query("DELETE FROM products WHERE slug LIKE 'imovel-demo-%';");
  },
};
