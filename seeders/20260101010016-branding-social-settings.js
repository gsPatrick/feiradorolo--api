'use strict';

/**
 * Conteúdo de marca/UI hoje hardcoded no front, agora editável pelo admin e
 * exposto ao frontend (is_public: true): top bar, redes sociais, textos do
 * rodapé, menus, links das lojas de app e parcelas máximas.
 * Ver regras/MAPEAMENTO_DINAMICO_ADMIN.md.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const rows = [
      { key: 'branding.topbar_message', group: 'general', value_type: 'string',
        value: 'Frete grátis a partir de R$ 79 | Parcelamos em até 12x', label: 'Mensagem da barra do topo' },
      { key: 'branding.footer_tagline', group: 'general', value_type: 'string',
        value: 'Sua plataforma de compras online preferida. Milhões de produtos com entrega rápida e segura.', label: 'Descrição da marca (rodapé)' },
      { key: 'branding.company_cnpj', group: 'general', value_type: 'string', value: '12.345.678/0001-90', label: 'CNPJ exibido no rodapé' },
      { key: 'branding.logo_url', group: 'general', value_type: 'string', value: '', label: 'URL do logo (vazio = texto)' },

      { key: 'payment.max_installments', group: 'payment', value_type: 'number', value: 12, label: 'Parcelas máximas exibidas', unit: 'x', min_value: 1, max_value: 24 },

      { key: 'social.links', group: 'general', value_type: 'json',
        value: {
          facebook: 'https://facebook.com/feiradorolo',
          instagram: 'https://instagram.com/feiradorolo',
          tiktok: 'https://tiktok.com/@feiradorolo',
          youtube: 'https://youtube.com/@feiradorolo',
          whatsapp: 'https://wa.me/5511999999999',
          x: 'https://x.com/feiradorolo',
        }, label: 'Links de redes sociais' },

      { key: 'nav.primary_menu', group: 'general', value_type: 'json',
        value: [
          { label: 'Ofertas', href: '/promocoes' },
          { label: 'Cupons', href: '/cupons' },
          { label: 'Casa & Jardim', href: '/categoria/casa-e-decoracao' },
          { label: 'Moda', href: '/categoria/roupas-femininas' },
          { label: 'Baixe nosso app', href: '/app' },
        ], label: 'Menu principal (nav)' },

      { key: 'nav.legal_links', group: 'general', value_type: 'json',
        value: [
          { label: 'Política de Privacidade', href: '/politica-de-privacidade' },
          { label: 'Termos de Uso', href: '/termos-de-uso' },
          { label: 'Suporte', href: '/suporte' },
        ], label: 'Links legais (rodapé)' },

      { key: 'footer.payment_card', group: 'general', value_type: 'json',
        value: {
          title: 'Mercado Pago', subtitle: 'Pagamento seguro e fácil',
          body: 'Com Mercado Pago, você paga com cartão, boleto ou Pix. Você também pode pagar em até 12x sem cartão com a Linha de Crédito.',
          link_text: 'Como pagar com Mercado Pago', link_url: '#',
        }, label: 'Card "Mercado Pago" do rodapé' },

      { key: 'footer.protection_card', group: 'general', value_type: 'json',
        value: {
          title: 'Proteção', subtitle: 'Compra protegida',
          body: 'Você não gostou do que comprou? Devolva! No Feira do Rolo não há nada que você não possa fazer, porque você está sempre protegido.',
          link_text: 'Como te protegemos', link_url: '#',
        }, label: 'Card "Proteção" do rodapé' },

      { key: 'app.store_links', group: 'general', value_type: 'json',
        value: { google_play: '#', app_store: '#', note: 'Funciona via Expo Go' }, label: 'Links das lojas de app' },
    ];

    await queryInterface.bulkInsert(
      'platform_settings',
      rows.map((r) => ({
        id: randomUUID(),
        key: r.key,
        value: JSON.stringify(r.value),
        default_value: JSON.stringify(r.value),
        group: r.group,
        value_type: r.value_type,
        label: r.label,
        unit: r.unit || null,
        min_value: r.min_value ?? null,
        max_value: r.max_value ?? null,
        is_public: true,
        is_editable: true,
        is_sensitive: false,
        is_encrypted: false,
        sort_order: 0,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('platform_settings', {
      key: {
        [Sequelize.Op.in]: [
          'branding.topbar_message', 'branding.footer_tagline', 'branding.company_cnpj', 'branding.logo_url',
          'payment.max_installments', 'social.links', 'nav.primary_menu', 'nav.legal_links',
          'footer.payment_card', 'footer.protection_card', 'app.store_links',
        ],
      },
    });
  },
};
