'use strict';

/**
 * verification_codes — códigos de verificação de e-mail e telefone/WhatsApp.
 * Guarda apenas o hash sha256 do código (nunca em claro). Idempotente: só cria
 * a tabela se ela ainda não existir (verifica via describeTable).
 */
async function tableExists(qi, table) {
  try {
    await qi.describeTable(table);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    if (await tableExists(queryInterface, 'verification_codes')) return;

    await queryInterface.createTable('verification_codes', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      channel: { type: Sequelize.ENUM('email', 'phone'), allowNull: false },
      code_hash: { type: Sequelize.STRING, allowNull: false },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      attempts: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      consumed_at: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('verification_codes', ['user_id']);
    await queryInterface.addIndex('verification_codes', ['channel']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('verification_codes');
  },
};
