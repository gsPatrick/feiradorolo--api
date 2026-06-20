'use strict';

/** addresses — agenda de endereços do usuário (entrega). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('addresses', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      label: { type: Sequelize.STRING(60), allowNull: true }, // Casa, Trabalho...
      recipient_name: { type: Sequelize.STRING(180), allowNull: true },
      phone: { type: Sequelize.STRING(20), allowNull: true },
      zip_code: { type: Sequelize.STRING(9), allowNull: false },
      street: { type: Sequelize.STRING(180), allowNull: false },
      number: { type: Sequelize.STRING(20), allowNull: true },
      complement: { type: Sequelize.STRING(120), allowNull: true },
      neighborhood: { type: Sequelize.STRING(120), allowNull: true },
      city: { type: Sequelize.STRING(120), allowNull: false },
      state: { type: Sequelize.STRING(2), allowNull: false },
      country: { type: Sequelize.STRING(2), allowNull: false, defaultValue: 'BR' },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('addresses', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('addresses');
  },
};
