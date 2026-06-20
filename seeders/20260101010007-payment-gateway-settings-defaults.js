'use strict';

/**
 * Linhas de bootstrap do gateway (Mercado Pago) para os dois ambientes.
 * Sem credenciais (o admin preenche/rotaciona pelo painel; os segredos serão
 * cifrados na camada de service). 'test' começa ativo.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const base = {
      provider: 'mercado_pago',
      public_key: null,
      access_token_encrypted: null,
      client_id: null,
      client_secret_encrypted: null,
      webhook_secret_encrypted: null,
      extra_encrypted: null,
      is_encrypted: true,
      key_version: 1,
      created_at: now,
      updated_at: now,
    };

    await queryInterface.bulkInsert('payment_gateway_settings', [
      { id: randomUUID(), ...base, environment: 'test', label: 'Mercado Pago (Teste)', is_active: true },
      { id: randomUUID(), ...base, environment: 'production', label: 'Mercado Pago (Produção)', is_active: false },
    ]);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('payment_gateway_settings', {
      provider: { [Sequelize.Op.in]: ['mercado_pago'] },
    });
  },
};
