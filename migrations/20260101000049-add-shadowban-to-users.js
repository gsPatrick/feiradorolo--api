'use strict';

/**
 * Adiciona users.is_shadowbanned — usuário "sombra-banido": continua usando a
 * plataforma normalmente do seu ponto de vista, mas suas mensagens de chat não
 * são entregues a terceiros (apenas persistidas e devolvidas ao próprio autor).
 * Idempotente (verifica a coluna existente via describeTable).
 */
async function addIfMissing(qi, table, column, spec) {
  const desc = await qi.describeTable(table);
  if (!desc[column]) await qi.addColumn(table, column, spec);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await addIfMissing(queryInterface, 'users', 'is_shadowbanned', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    const desc = await queryInterface.describeTable('users');
    if (desc.is_shadowbanned) await queryInterface.removeColumn('users', 'is_shadowbanned');
  },
};
