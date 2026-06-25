'use strict';

/**
 * Produtos demo da vertical VEÍCULOS (categoria `veiculos`), com specifications
 * preenchidas (tipo_veiculo/carroceria/marca/modelo/ano/km/combustivel/cambio/
 * condicao) e city/state, para que a busca por specs e por localização retorne
 * resultados. Vendedor = admin (super admin / primeiro usuário).
 *
 * Idempotente: cada veículo tem slug estável (veiculo-demo-N) e usa
 * UPDATE-then-INSERT pelo slug para não duplicar em re-execuções.
 */
const { randomUUID } = require('crypto');

const IMG = 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?q=80&w=900&auto=format&fit=crop';

// title, tipo, carroceria, marca, modelo, ano, km, combustivel, cambio,
// condicao, cor, city, state, price, lat, lng
const DATA = [
  ['Honda Civic 2020 Flex', 'Carro', 'Sedã', 'Honda', 'Civic', '2020', 45000, 'Flex', 'Automático', 'Seminovo', 'Prata', 'São Paulo', 'SP', 95000, -23.5505, -46.6333],
  ['Fiat Strada 2021 Cabine Dupla', 'Carro', 'Picape', 'Fiat', 'Strada', '2021', 38000, 'Flex', 'Manual', 'Seminovo', 'Branco', 'Campinas', 'SP', 80000, -22.9099, -47.0626],
  ['Honda CG 160 2022', 'Moto', null, 'Honda', 'CG 160 Fan', '2022', 12000, 'Gasolina', 'Manual', 'Usado', 'Vermelho', 'Belo Horizonte', 'MG', 14000, -19.9167, -43.9345],
  ['Toyota Corolla 2019 XEI', 'Carro', 'Sedã', 'Toyota', 'Corolla', '2019', 62000, 'Flex', 'Automático', 'Usado', 'Preto', 'Rio de Janeiro', 'RJ', 110000, -22.9711, -43.1822],
  ['Jeep Compass 2022 Longitude', 'Carro', 'SUV', 'Jeep', 'Compass', '2022', 28000, 'Diesel', 'Automático', 'Seminovo', 'Cinza', 'Curitiba', 'PR', 165000, -25.4284, -49.2733],
  ['Volkswagen Gol 2018 1.0', 'Carro', 'Hatch', 'Volkswagen', 'Gol', '2018', 78000, 'Flex', 'Manual', 'Usado', 'Branco', 'Goiânia', 'GO', 42000, -16.6869, -49.2648],
  ['Chevrolet Onix 2021 LT', 'Carro', 'Hatch', 'Chevrolet', 'Onix', '2021', 33000, 'Flex', 'Automático', 'Seminovo', 'Prata', 'Sorocaba', 'SP', 78000, -23.5015, -47.4526],
  ['Hyundai HB20 2020 Comfort', 'Carro', 'Hatch', 'Hyundai', 'HB20', '2020', 51000, 'Flex', 'Manual', 'Usado', 'Azul', 'Porto Alegre', 'RS', 62000, -30.0346, -51.2177],
  ['Yamaha Fazer 250 2021', 'Moto', null, 'Honda', 'Fazer 250', '2021', 9000, 'Gasolina', 'Manual', 'Seminovo', 'Azul', 'Recife', 'PE', 19000, -8.0476, -34.8770],
  ['BYD Dolphin 2024 Elétrico', 'Carro', 'Elétrico', 'BYD', 'Dolphin', '2024', 5000, 'Elétrico', 'Automático', 'Seminovo', 'Branco', 'São Paulo', 'SP', 149000, -23.5505, -46.6333],
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

    const [[cat]] = await seq.query("SELECT id FROM categories WHERE slug = 'veiculos' LIMIT 1;");
    if (!cat) return;

    // Veículos exige plano ativo (category_pricing.requires_plan = true); sem ele o
    // job de scheduler pausa os anúncios. Garante uma assinatura ATIVA do plano de
    // Veículos (ou global) para o vendedor demo, para os demos ficarem publicados.
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
              s: startsAt, e: endsAt, meta: JSON.stringify({ source: 'veiculos-demo-seed' }), now,
            },
          }
        );
      }
    }

    let i = 0;
    for (const d of DATA) {
      const [title, tipo, carroceria, marca, modelo, ano, km, combustivel, cambio, condicao, cor, city, state, price, lat, lng] = d;
      i += 1;
      const slug = `veiculo-demo-${i}`;
      const specifications = {
        tipo_veiculo: tipo,
        marca,
        modelo,
        ano,
        condicao,
      };
      if (carroceria != null) specifications.carroceria = carroceria;
      if (km != null) specifications.km = km;
      if (combustivel != null) specifications.combustivel = combustivel;
      if (cambio != null) specifications.cambio = cambio;
      if (cor != null) specifications.cor = cor;

      const descr = `${title} em ${city}/${state}. ${marca} ${modelo} ${ano}` +
        `${km != null ? `, ${km.toLocaleString('pt-BR')} km` : ''}` +
        `${combustivel ? `, ${combustivel}` : ''}` +
        `${cambio ? `, câmbio ${cambio.toLowerCase()}` : ''}. ${condicao}. ` +
        `Negócio protegido pela Feira do Rolo.`;

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
            meta: JSON.stringify({ vertical: 'veiculos' }),
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
            meta: JSON.stringify({ vertical: 'veiculos' }),
            now,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    await seq.query("DELETE FROM products WHERE slug LIKE 'veiculo-demo-%';");
  },
};
