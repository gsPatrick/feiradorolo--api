'use strict';

/**
 * saved_cards — cartões salvos no Mercado Pago (Customers) para débito automático
 * recorrente de planos. Guarda apenas referências MP (customer_id/card_id), os 4
 * últimos dígitos e a bandeira — nunca o PAN.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('saved_cards', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      mp_customer_id: { type: Sequelize.STRING, allowNull: false },
      mp_card_id: { type: Sequelize.STRING, allowNull: false },
      last_four: { type: Sequelize.STRING(4), allowNull: true },
      brand: { type: Sequelize.STRING, allowNull: true },
      is_default: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('saved_cards', ['user_id']);
    await queryInterface.addIndex('saved_cards', ['user_id', 'is_default']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('saved_cards');
  },
};
