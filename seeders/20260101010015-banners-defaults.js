'use strict';

/**
 * Banners default — replicam EXATAMENTE os banners hoje hardcoded no front
 * (3 slides do HeroBanner + Flash Sale + App Promo), agora editáveis pelo admin
 * com cor/gradiente, texto, emoji/ícone, CTA e `content` livre.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const base = { is_active: true, impressions_count: 0, clicks_count: 0, created_by: null, category_id: null, created_at: now, updated_at: now };

    const rows = [
      // ---- HeroBanner (carrossel home) ----
      {
        ...base, id: randomUUID(), position: 'home_hero', variant: 'hero', sort_order: 1,
        title: 'Baixe nosso App', subtitle: 'Compre com mais praticidade e ganhe ofertas exclusivas',
        background_type: 'gradient', background_gradient: 'linear-gradient(110deg, #1e3a8a 0%, #4c1d95 55%, #7c3aed 100%)',
        text_color: '#ffffff', icon: 'smartphone', cta_text: 'Baixar Agora', cta_url: '/app', link_url: '/app',
        content: JSON.stringify({ cta_icon: 'download', side: { top: 'GRÁTIS', word: 'App', bottom: 'DISPONÍVEL' } }),
      },
      {
        ...base, id: randomUUID(), position: 'home_hero', variant: 'hero', sort_order: 2,
        title: 'Frete grátis a partir de R$ 79', subtitle: 'Em milhares de produtos selecionados para você',
        background_type: 'gradient', background_gradient: 'linear-gradient(110deg, #0f766e 0%, #1d4ed8 60%, #4f46e5 100%)',
        text_color: '#ffffff', icon: 'truck', cta_text: 'Ver ofertas', cta_url: '/promocoes', link_url: '/promocoes',
        content: JSON.stringify({ cta_icon: 'arrow-right', side: { top: 'ATÉ', word: 'Frete', bottom: 'GRÁTIS' } }),
      },
      {
        ...base, id: randomUUID(), position: 'home_hero', variant: 'hero', sort_order: 3,
        title: 'Cupons toda semana', subtitle: 'Descontos exclusivos para você economizar de verdade',
        background_type: 'gradient', background_gradient: 'linear-gradient(110deg, #b45309 0%, #db2777 55%, #7c3aed 100%)',
        text_color: '#ffffff', icon: 'tag', cta_text: 'Pegar cupons', cta_url: '/cupons', link_url: '/cupons',
        content: JSON.stringify({ cta_icon: 'arrow-right', side: { top: 'NOVOS', word: 'Cupons', bottom: 'TODA SEMANA' } }),
      },

      // ---- Flash Sale (barra vermelha) ----
      {
        ...base, id: randomUUID(), position: 'home_flash', variant: 'flash_sale', sort_order: 1,
        title: 'Flash Sale', subtitle: 'Ofertas relâmpago com até 80% OFF',
        background_type: 'color', background_color: '#e3261f', text_color: '#ffffff',
        icon: 'bolt', cta_text: 'Ver Todas', cta_url: '/promocoes', link_url: '/promocoes',
        content: JSON.stringify({ accent: '#ffd700', timer: { hours: '05', minutes: '18', seconds: '20' } }),
      },

      // ---- App Promo (Baixe o App) ----
      {
        ...base, id: randomUUID(), position: 'app_promo', variant: 'app_promo', sort_order: 1,
        title: 'Baixe nosso App Feira do Rolo!', subtitle: 'Melhor experiência de compras no seu celular',
        background_type: 'color', background_color: '#f3f4f6', text_color: '#111827',
        content: JSON.stringify({
          features: ['Ofertas exclusivas', 'Acompanhe pedidos', 'PIX instantâneo'],
          store_links: { google_play: '#', app_store: '#' },
          note: 'Funciona via Expo Go',
        }),
      },

      // ---- QuickAccessCards (6 cards coloridos da home) ----
      ...[
        { color: '#2563eb', soft: '#dbeafe', icon: 'eye', title: 'Visto Recentemente', desc: 'Reveja produtos que você visitou', cta: 'Ver histórico', href: '/favoritos' },
        { color: '#16a34a', soft: '#dcfce7', icon: 'map-pin', title: 'Produtos Perto de Você', desc: 'Encontre vendedores próximos', cta: 'Inserir localização', href: '/proximos' },
        { color: '#ea580c', soft: '#ffedd5', icon: 'dollar', title: 'Menos de R$100', desc: 'Produtos com preços baixos', cta: 'Mostrar produtos', href: '/promocoes' },
        { color: '#7c3aed', soft: '#ede9fe', icon: 'trending-up', title: 'Mais Vendidos', desc: 'Produtos favoritos dos clientes', cta: 'Ir para Mais vendidos', href: '/promocoes' },
        { color: '#dc2626', soft: '#fee2e2', icon: 'card', title: '50% de Desconto', desc: 'Ofertas imperdíveis', cta: 'Ver promoções', href: '/promocoes' },
        { color: '#0d9488', soft: '#ccfbf1', icon: 'truck', title: 'Frete Grátis', desc: 'Compras acima de R$150', cta: 'Como funciona', href: '/frete-e-entrega' },
      ].map((c, i) => ({
        ...base, id: randomUUID(), position: 'home_strip', variant: 'quick_access', sort_order: i + 1,
        title: c.title, subtitle: c.desc, background_type: 'color', background_color: c.color, text_color: c.color,
        icon: c.icon, cta_text: c.cta, cta_url: c.href, link_url: c.href,
        content: JSON.stringify({ soft: c.soft }),
      })),
    ];

    await queryInterface.bulkInsert('banners', rows);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('banners', {
      position: { [Sequelize.Op.in]: ['home_hero', 'home_flash', 'app_promo', 'home_strip'] },
    });
  },
};
