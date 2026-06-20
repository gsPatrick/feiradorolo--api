'use strict';

/**
 * Produtos demo (status `active`) para o catálogo não ficar vazio durante a
 * integração do front. Vendedor = super admin; categorias resolvidas por slug.
 */
const { randomUUID } = require('crypto');

const IMG = [
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1524805444758-089113d48a6d?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1553062407-98eeb64c6a62?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1572635196237-14b3f281503f?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1546868871-7041f2a55e12?q=80&w=700&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1593642632823-8f785ba67e45?q=80&w=700&auto=format&fit=crop',
];

// [title, price(atual), oldPrice(original|null), brand, condition, freeShipping, categorySlug]
const DATA = [
  ['Tênis de corrida edição limitada Aurora', 459.9, 699.9, 'Nike', 'new', true, 'esportes-e-atividades-ao-ar-livre'],
  ['Headphone over-ear bluetooth premium', 329.0, null, 'JBL', 'new', true, 'audio'],
  ['Relógio analógico aço inoxidável', 712.5, 890.0, 'Casio', 'used', false, 'relogios'],
  ['Câmera mirrorless 24MP compacta', 2899.0, null, 'Sony', 'new', true, 'cameras-e-drones'],
  ['Mochila antifurto resistente à água', 189.9, 249.9, 'Samsonite', 'new', true, 'acessorios-de-moda'],
  ['Teclado mecânico RGB switch blue', 289.0, 349.0, 'Redragon', 'new', false, 'computadores-e-acessorios'],
  ['Cadeira gamer ergonômica reclinável', 1199.0, 1499.0, 'ThunderX', 'new', true, 'casa-e-decoracao'],
  ['Smartphone 128GB tela AMOLED', 1799.0, 2099.0, 'Samsung', 'new', true, 'celulares-e-dispositivos'],
  ['Óculos de sol polarizado UV400', 159.9, null, 'Ray-Ban', 'used', false, 'acessorios-de-moda'],
  ['Caixa de som portátil à prova d’água', 219.0, 279.0, 'JBL', 'new', true, 'audio'],
  ['Notebook 15.6” i5 16GB SSD 512GB', 3499.0, 3999.0, 'Lenovo', 'new', true, 'computadores-e-acessorios'],
  ['Smartwatch fitness com GPS', 499.0, 649.0, 'Xiaomi', 'new', true, 'relogios'],
];

function slugify(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const [[seller]] = await queryInterface.sequelize.query(
      "SELECT id FROM users ORDER BY created_at ASC LIMIT 1;"
    );
    if (!seller) return;

    const [cats] = await queryInterface.sequelize.query('SELECT id, slug FROM categories;');
    const bySlug = Object.fromEntries(cats.map((c) => [c.slug, c.id]));
    const fallback = cats[0] && cats[0].id;

    const rows = DATA.map((d, i) => {
      const [title, price, oldPrice, brand, condition, freeShipping, catSlug] = d;
      const hasPromo = oldPrice != null;
      return {
        id: randomUUID(),
        seller_id: seller.id,
        category_id: bySlug[catSlug] || fallback,
        title,
        slug: `${slugify(title)}-${i + 1}`,
        description: `${title}. Produto em ótimo estado, pronta entrega. Pagamento protegido pela Feira do Rolo.`,
        price: hasPromo ? oldPrice : price,
        promotional_price: hasPromo ? price : null,
        currency: 'BRL',
        condition,
        stock: 5 + i,
        status: 'active',
        highlight_tier: i % 4 === 0 ? 'gold' : 'none',
        requires_shipping: true,
        weight_grams: 800 + i * 100,
        images: JSON.stringify([IMG[i % IMG.length]]),
        metadata: JSON.stringify({ brand, free_shipping: freeShipping, rating: 4 + (i % 10) / 10 }),
        views_count: 0,
        favorites_count: 0,
        created_at: now,
        updated_at: now,
      };
    });

    await queryInterface.bulkInsert('products', rows);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('products', null, {});
  },
};
