'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('seller_payment_accounts', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.ENUM('mercado_pago'), allowNull: false, defaultValue: 'mercado_pago' },
      mp_user_id: { type: Sequelize.STRING(60) },
      public_key: { type: Sequelize.STRING },
      access_token_encrypted: { type: Sequelize.TEXT },
      refresh_token_encrypted: { type: Sequelize.TEXT },
      scope: { type: Sequelize.STRING(255) },
      status: { type: Sequelize.ENUM('pending', 'linked', 'expired', 'revoked'), allowNull: false, defaultValue: 'pending' },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      expires_at: { type: Sequelize.DATE },
      linked_at: { type: Sequelize.DATE },
      key_version: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      raw: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('seller_payment_accounts', ['user_id', 'provider'], { unique: true, name: 'seller_payment_accounts_user_provider_unique' });
    await queryInterface.addIndex('seller_payment_accounts', ['mp_user_id']);
    await queryInterface.addIndex('seller_payment_accounts', ['status']);
    await queryInterface.addIndex('seller_payment_accounts', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('seller_payment_accounts');
  },
};
