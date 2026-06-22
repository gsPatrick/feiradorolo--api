'use strict';

/** site_sessions — presença/visitas: uma linha por sessão anônima por DIA. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('site_sessions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      session_id: { type: Sequelize.STRING, allowNull: false },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      day: { type: Sequelize.DATEONLY, allowNull: false },
      first_seen_at: { type: Sequelize.DATE, allowNull: true },
      last_seen_at: { type: Sequelize.DATE, allowNull: true },
      hits: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 1 },
      path: { type: Sequelize.STRING, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('site_sessions', ['session_id', 'day'], {
      unique: true,
      name: 'site_sessions_session_day_unique',
    });
    await queryInterface.addIndex('site_sessions', ['day']);
    await queryInterface.addIndex('site_sessions', ['last_seen_at']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('site_sessions');
  },
};
