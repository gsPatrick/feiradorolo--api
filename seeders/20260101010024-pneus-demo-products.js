'use strict';

/**
 * Produtos demo da vertical PNEUS (categoria pneus-automoveis), com
 * specifications preenchidas (largura/perfil/aro/marca) para que a busca por
 * medida retorne resultados. Vendedor = admin (super admin / primeiro usuário).
 *
 * Idempotente: cada produto tem slug estável (pneu-demo-N) e usa
 * ON CONFLICT (slug) para não duplicar em re-execuções.
 */
const { randomUUID } = require('crypto');

const IMG = 'https://images.unsplash.com/photo-1568029149-ba3904d4d17b?q=80&w=700&auto=format&fit=crop';

// largura, perfil, aro, marca, condition, price, promo, stock, carga, vel, runflat
const DATA = [
  [205, 55, 16, 'Michelin', 'new', 689.9, 599.9, 12, '91', 'V', false],
  [175, 70, 14, 'Pirelli', 'new', 389.9, null, 20, '88', 'T', false],
  [225, 45, 17, 'Goodyear', 'new', 749.0, 679.0, 8, '94', 'W', true],
  [195, 60, 15, 'Continental', 'new', 459.9, null, 16, '88', 'H', false],
  [185, 65, 15, 'Bridgestone', 'used', 249.9, null, 6, '88', 'H', false],
  [215, 50, 17, 'Firestone', 'new', 559.0, 499.0, 10, '95', 'V', false],
  [205, 55, 16, 'Goodyear', 'new', 619.9, null, 14, '91', 'V', false],
  [235, 45, 18, 'Pirelli', 'new', 929.0, 849.0, 6, '98', 'Y', true],
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

    const [[cat]] = await seq.query(
      "SELECT id FROM categories WHERE slug = 'pneus-automoveis' LIMIT 1;"
    );
    if (!cat) return;

    let i = 0;
    for (const d of DATA) {
      const [largura, perfil, aro, marca, condition, price, promo, stock, carga, vel, runflat] = d;
      i += 1;
      const title = `Pneu ${largura}/${perfil}R${aro} ${marca}`;
      const slug = `pneu-demo-${i}`;
      const specifications = {
        largura: String(largura),
        perfil: String(perfil),
        aro: String(aro),
        marca,
        indice_carga: carga,
        indice_velocidade: vel,
        runflat,
      };

      // products.slug não tem UNIQUE; idempotência via UPDATE-then-INSERT pelo
      // slug estável (pneu-demo-N). Re-rodar atualiza em vez de duplicar.
      const [, updateMeta] = await seq.query(
        `UPDATE products SET
           category_id = :cid, title = :title, price = :price,
           promotional_price = :promo, condition = :cond, stock = :stock,
           status = 'active', specifications = :specs, images = :images,
           cover_image_url = :cover, metadata = :meta, updated_at = :now,
           deleted_at = NULL
         WHERE slug = :slug`,
        {
          replacements: {
            cid: cat.id,
            title,
            slug,
            price,
            promo,
            cond: condition,
            stock,
            specs: JSON.stringify(specifications),
            images: JSON.stringify([IMG]),
            cover: IMG,
            meta: JSON.stringify({ brand: marca }),
            now,
          },
        }
      );
      if (updateMeta && updateMeta.rowCount > 0) continue;

      await seq.query(
        `INSERT INTO products
           (id, seller_id, category_id, title, slug, description, price,
            promotional_price, currency, condition, stock, status, highlight_tier,
            requires_shipping, specifications, images, cover_image_url, metadata,
            views_count, favorites_count, published_at, created_at, updated_at)
         VALUES
           (:id, :sid, :cid, :title, :slug, :descr, :price,
            :promo, 'BRL', :cond, :stock, 'active', 'none',
            true, :specs, :images, :cover, :meta,
            0, 0, :now, :now, :now)`,
        {
          replacements: {
            id: randomUUID(),
            sid: sellerId,
            cid: cat.id,
            title,
            slug,
            descr: `${title} — medida ${largura}/${perfil}R${aro}. Pronta entrega, pagamento protegido pela Feira do Rolo.`,
            price,
            promo,
            cond: condition,
            stock,
            specs: JSON.stringify(specifications),
            images: JSON.stringify([IMG]),
            cover: IMG,
            meta: JSON.stringify({ brand: marca }),
            now,
          },
        }
      );
    }
  },

  async down(queryInterface) {
    const seq = queryInterface.sequelize;
    await seq.query("DELETE FROM products WHERE slug LIKE 'pneu-demo-%';");
  },
};
