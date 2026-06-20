'use strict';

/**
 * Bootstrap do primeiro SUPER ADMIN, para operar o painel. Idempotente: não
 * recria se o e-mail já existir. Credenciais via .env (com defaults de dev):
 *   ADMIN_EMAIL (default admin@feiradorolo.com)
 *   ADMIN_PASSWORD (default ChangeMe123! — TROQUE em produção)
 *   ADMIN_NAME (default Super Admin)
 *
 * Define is_admin=true (bypass total) e também vincula o papel 'super_admin'
 * do RBAC, mantendo a autorização granular como fonte da verdade.
 */
const { randomUUID } = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = {
  async up(queryInterface) {
    const email = (process.env.ADMIN_EMAIL || 'admin@feiradorolo.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const name = process.env.ADMIN_NAME || 'Super Admin';

    const [existing] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1;',
      { replacements: { email } }
    );
    if (existing && existing.length) return; // já existe

    const now = new Date();
    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await queryInterface.bulkInsert('users', [
      {
        id: userId,
        name,
        email,
        password_hash: passwordHash,
        person_type: 'individual',
        is_seller: false,
        seller_tier: 'standard',
        is_admin: true,
        admin_role: 'admin',
        account_status: 'active',
        has_first_sale: false,
        has_first_purchase: false,
        seller_verification_status: 'not_required',
        buyer_verification_status: 'not_required',
        country: 'BR',
        email_verified_at: now,
        created_at: now,
        updated_at: now,
      },
    ]);

    // Vincula o papel super_admin (RBAC).
    const [roles] = await queryInterface.sequelize.query(
      "SELECT id FROM roles WHERE slug = 'super_admin' LIMIT 1;"
    );
    if (roles && roles.length) {
      await queryInterface.bulkInsert('user_roles', [
        { id: randomUUID(), user_id: userId, role_id: roles[0].id, created_at: now, updated_at: now },
      ]);
    }
  },

  async down(queryInterface) {
    const email = (process.env.ADMIN_EMAIL || 'admin@feiradorolo.com').toLowerCase();
    await queryInterface.bulkDelete('users', { email });
  },
};
