'use strict';

/**
 * Adiciona users.document_verified_at — marca o momento em que o documento do
 * vendedor (CPF para PF, CNPJ para PJ) foi validado (nível 2 de verificação).
 * PF é validado matematicamente; PJ via ReceitaWS (com fallback no cálculo).
 * Idempotente (verifica a coluna existente via describeTable).
 */
async function addIfMissing(qi, table, column, spec) {
  const desc = await qi.describeTable(table);
  if (!desc[column]) await qi.addColumn(table, column, spec);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addIfMissing(queryInterface, 'users', 'document_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('users');
    if (desc.document_verified_at) await queryInterface.removeColumn('users', 'document_verified_at');
  },
};
