'use strict';

/**
 * messages — mensagens de um chat. `moderation_status` e
 * `contains_blocked_words` integram com a aba Segurança (blocked_words) e a
 * moderação de chat.
 */
module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define(
    'Message',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      chat_id: { type: DataTypes.UUID, allowNull: false },
      sender_id: { type: DataTypes.UUID, allowNull: false },
      type: {
        type: DataTypes.ENUM('text', 'image', 'system', 'offer'),
        allowNull: false,
        defaultValue: 'text',
      },
      content: { type: DataTypes.TEXT, allowNull: true },
      attachments: { type: DataTypes.JSONB, allowNull: true },
      is_read: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      read_at: { type: DataTypes.DATE, allowNull: true },
      moderation_status: {
        type: DataTypes.ENUM('clean', 'flagged', 'blocked', 'reviewed'),
        allowNull: false,
        defaultValue: 'clean',
      },
      contains_blocked_words: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      flagged_reason: { type: DataTypes.STRING(180), allowNull: true },
    },
    {
      tableName: 'messages',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['chat_id'] },
        { fields: ['sender_id'] },
        { fields: ['moderation_status'] },
      ],
    }
  );

  Message.associate = (models) => {
    Message.belongsTo(models.Chat, { foreignKey: 'chat_id', as: 'chat' });
    Message.belongsTo(models.User, { foreignKey: 'sender_id', as: 'sender' });
  };

  return Message;
};
