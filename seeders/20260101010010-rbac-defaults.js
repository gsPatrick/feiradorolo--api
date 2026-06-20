'use strict';

/**
 * Bootstrap do RBAC granular: permissões (module.action) cobrindo todas as abas
 * do admin + features da engine, papéis de sistema e o mapeamento papel→permissão.
 * Idempotência: usa upsert por chave/slug (não duplica se rodar novamente).
 */
const { randomUUID } = require('crypto');

// Módulos -> ações. Geram permissões `${module}.${action}`.
const MODULES = {
  orders: ['view', 'manage', 'resolve_dispute', 'refund'],
  users: ['view', 'manage', 'ban', 'verify'],
  chat: ['view', 'moderate'],
  analytics: ['view'],
  revenue: ['view', 'manage'], // commission_rules, highlight_packages, category_pricing, shipping
  emails: ['view', 'manage'], // message_templates (e-mail)
  audit: ['view'],
  specifications: ['view', 'manage'], // categories, field_definitions
  tests: ['view', 'run'],
  security: ['view', 'manage'], // blocked_words, user_bans, security settings
  push: ['view', 'manage'], // message_templates (push), notifications
  coupons: ['view', 'manage'],
  banners: ['view', 'manage'],
  integrations: ['view', 'manage'], // integration_settings, payment_gateway_settings
  settings: ['view', 'manage'], // platform_settings genéricas
  rbac: ['view', 'manage'], // roles, permissions, atribuições
};

const ROLES = [
  { slug: 'super_admin', name: 'Super Admin', level: 100, description: 'Acesso total, incluindo RBAC.' },
  { slug: 'admin', name: 'Administrador', level: 90, description: 'Administra a plataforma (exceto gestão de papéis).' },
  { slug: 'finance', name: 'Financeiro', level: 60, description: 'Receitas, pedidos, cupons e integrações de pagamento.' },
  { slug: 'moderator', name: 'Moderador', level: 50, description: 'Chat, segurança e moderação de usuários.' },
  { slug: 'support', name: 'Suporte', level: 40, description: 'Visualização de pedidos, usuários e chat.' },
  { slug: 'seller', name: 'Vendedor', level: 10, description: 'Papel de marketplace (sem acesso admin).' },
  { slug: 'user', name: 'Usuário', level: 0, description: 'Papel base de comprador.' },
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    // 1) Permissões.
    const permKeys = [];
    const permRows = [];
    for (const [mod, actions] of Object.entries(MODULES)) {
      for (const action of actions) {
        const key = `${mod}.${action}`;
        permKeys.push(key);
        permRows.push({
          id: randomUUID(),
          key,
          name: `${mod} · ${action}`,
          module: mod,
          action,
          is_system: true,
          created_at: now,
          updated_at: now,
        });
      }
    }
    await queryInterface.bulkInsert('permissions', permRows);

    // Mapa key -> id (a partir do que acabamos de gerar).
    const permIdByKey = Object.fromEntries(permRows.map((p) => [p.key, p.id]));
    const allKeys = permKeys.slice();

    // 2) Papéis.
    const roleRows = ROLES.map((r) => ({
      id: randomUUID(),
      name: r.name,
      slug: r.slug,
      description: r.description,
      level: r.level,
      is_system: true,
      is_active: true,
      created_at: now,
      updated_at: now,
    }));
    await queryInterface.bulkInsert('roles', roleRows);
    const roleIdBySlug = Object.fromEntries(roleRows.map((r) => [r.slug, r.id]));

    // 3) Mapeamento papel -> permissões.
    const grant = {
      super_admin: allKeys, // tudo
      admin: allKeys.filter((k) => k !== 'rbac.manage'), // tudo, menos gerir papéis
      finance: [
        'revenue.view', 'revenue.manage',
        'orders.view', 'orders.refund',
        'analytics.view', 'audit.view',
        'coupons.view', 'coupons.manage',
        'integrations.view', 'settings.view',
      ],
      moderator: [
        'chat.view', 'chat.moderate',
        'security.view', 'security.manage',
        'users.view', 'users.ban',
        'audit.view',
      ],
      support: ['orders.view', 'users.view', 'chat.view', 'push.view'],
      seller: [], // permissões de marketplace serão tratadas fora do escopo admin
      user: [],
    };

    const rolePermRows = [];
    for (const [slug, keys] of Object.entries(grant)) {
      const roleId = roleIdBySlug[slug];
      for (const key of keys) {
        const permId = permIdByKey[key];
        if (roleId && permId) {
          rolePermRows.push({ id: randomUUID(), role_id: roleId, permission_id: permId, created_at: now });
        }
      }
    }
    if (rolePermRows.length) await queryInterface.bulkInsert('role_permissions', rolePermRows);
  },

  async down(queryInterface) {
    // role_permissions cai por CASCADE ao remover roles/permissions.
    await queryInterface.bulkDelete('role_permissions', null, {});
    await queryInterface.bulkDelete('roles', null, {});
    await queryInterface.bulkDelete('permissions', null, {});
  },
};
