'use strict';

/**
 * chats — conversa entre comprador e vendedor, opcionalmente atrelada a um
 * produto e/ou pedido. `is_flagged` alimenta a aba Chat/Moderação do admin.
 */
module.exports = (sequelize, DataTypes) => {
  const Chat = sequelize.define(
    'Chat',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      product_id: { type: DataTypes.UUID, allowNull: true },
      order_id: { type: DataTypes.UUID, allowNull: true },
      buyer_id: { type: DataTypes.UUID, allowNull: false },
      seller_id: { type: DataTypes.UUID, allowNull: false },
      subject: { type: DataTypes.STRING(180), allowNull: true },
      status: {
        type: DataTypes.ENUM('open', 'closed', 'archived', 'flagged'),
        allowNull: false,
        defaultValue: 'open',
      },
      is_flagged: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      last_message_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'chats',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['buyer_id'] },
        { fields: ['seller_id'] },
        { fields: ['product_id'] },
        { fields: ['order_id'] },
        { fields: ['status'] },
      ],
    }
  );

  Chat.associate = (models) => {
    Chat.belongsTo(models.User, { foreignKey: 'buyer_id', as: 'buyer' });
    Chat.belongsTo(models.User, { foreignKey: 'seller_id', as: 'seller' });
    Chat.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
    Chat.belongsTo(models.Order, { foreignKey: 'order_id', as: 'order' });
    Chat.hasMany(models.Message, { foreignKey: 'chat_id', as: 'messages' });
  };

  return Chat;
};
