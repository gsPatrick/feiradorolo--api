'use strict';

/**
 * Camada 3 (KYC/antifraude):
 * - orders.held_for_buyer_verification: pedido retido até o comprador concluir a
 *   verificação facial na 1ª compra.
 * - orders.delivery_method: envio (shipping) ou retirada presencial (pickup).
 * - escrow.pickup_token: token numérico de 6 dígitos para liberação presencial.
 * Idempotente (verifica colunas existentes).
 */
async function addIfMissing(qi, table, column, spec) {
  const desc = await qi.describeTable(table);
  if (!desc[column]) await qi.addColumn(table, column, spec);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addIfMissing(queryInterface, 'orders', 'held_for_buyer_verification', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await addIfMissing(queryInterface, 'orders', 'delivery_method', {
      type: Sequelize.ENUM('shipping', 'pickup'),
      allowNull: false,
      defaultValue: 'shipping',
    });
    await addIfMissing(queryInterface, 'escrow', 'pickup_token', {
      type: Sequelize.STRING(6),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('orders', 'held_for_buyer_verification');
    await queryInterface.removeColumn('orders', 'delivery_method');
    await queryInterface.removeColumn('escrow', 'pickup_token');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_orders_delivery_method";');
  },
};
