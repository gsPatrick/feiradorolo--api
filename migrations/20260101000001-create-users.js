'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('users', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(180), allowNull: false },
      email: { type: Sequelize.STRING(180), allowNull: false, unique: true },
      phone: { type: Sequelize.STRING(20) },
      password_hash: { type: Sequelize.STRING },
      firebase_uid: { type: Sequelize.STRING(128), unique: true },
      person_type: { type: Sequelize.ENUM('individual', 'company'), allowNull: false, defaultValue: 'individual' },
      cpf: { type: Sequelize.STRING(11), unique: true },
      cnpj: { type: Sequelize.STRING(14), unique: true },
      legal_name: { type: Sequelize.STRING(180) },
      birth_date: { type: Sequelize.DATEONLY },
      avatar_url: { type: Sequelize.STRING },
      is_seller: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      seller_tier: { type: Sequelize.ENUM('standard', 'premium'), allowNull: false, defaultValue: 'standard' },
      is_admin: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      admin_role: { type: Sequelize.ENUM('admin', 'moderator') },
      account_status: { type: Sequelize.ENUM('active', 'pending', 'suspended', 'banned'), allowNull: false, defaultValue: 'active' },
      email_verified_at: { type: Sequelize.DATE },
      phone_verified_at: { type: Sequelize.DATE },
      has_first_sale: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      has_first_purchase: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      seller_verification_status: { type: Sequelize.ENUM('not_required', 'pending', 'verified', 'rejected'), allowNull: false, defaultValue: 'not_required' },
      buyer_verification_status: { type: Sequelize.ENUM('not_required', 'pending', 'verified', 'rejected'), allowNull: false, defaultValue: 'not_required' },
      latitude: { type: Sequelize.DECIMAL(10, 7) },
      longitude: { type: Sequelize.DECIMAL(10, 7) },
      zip_code: { type: Sequelize.STRING(9) },
      street: { type: Sequelize.STRING(180) },
      number: { type: Sequelize.STRING(20) },
      complement: { type: Sequelize.STRING(120) },
      neighborhood: { type: Sequelize.STRING(120) },
      city: { type: Sequelize.STRING(120) },
      state: { type: Sequelize.STRING(2) },
      country: { type: Sequelize.STRING(2), allowNull: false, defaultValue: 'BR' },
      last_login_at: { type: Sequelize.DATE },
      metadata: { type: Sequelize.JSONB },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      deleted_at: { type: Sequelize.DATE },
    });

    await queryInterface.addIndex('users', ['account_status']);
    await queryInterface.addIndex('users', ['is_seller']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('users');
  },
};
