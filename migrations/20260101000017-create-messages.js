'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      chat_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'chats', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      sender_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      type: { type: Sequelize.ENUM('text', 'image', 'system', 'offer'), allowNull: false, defaultValue: 'text' },
      content: { type: Sequelize.TEXT },
      attachments: { type: Sequelize.JSONB },
      is_read: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      read_at: { type: Sequelize.DATE },
      moderation_status: { type: Sequelize.ENUM('clean', 'flagged', 'blocked', 'reviewed'), allowNull: false, defaultValue: 'clean' },
      contains_blocked_words: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      flagged_reason: { type: Sequelize.STRING(180) },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('messages', ['chat_id']);
    await queryInterface.addIndex('messages', ['sender_id']);
    await queryInterface.addIndex('messages', ['moderation_status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
  },
};
