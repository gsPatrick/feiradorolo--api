'use strict';

/**
 * saved_cards — cartões salvos no Mercado Pago (Customers) para débito automático
 * recorrente de planos. NÃO armazena PAN: apenas referências do MP (customer_id /
 * card_id), os 4 últimos dígitos e a bandeira — por isso é seguro guardar em texto.
 */
module.exports = (sequelize, DataTypes) => {
  const SavedCard = sequelize.define(
    'SavedCard',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      mp_customer_id: { type: DataTypes.STRING, allowNull: false },
      mp_card_id: { type: DataTypes.STRING, allowNull: false },
      last_four: { type: DataTypes.STRING(4), allowNull: true },
      brand: { type: DataTypes.STRING, allowNull: true },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'saved_cards',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { fields: ['user_id', 'is_default'] },
      ],
    }
  );

  SavedCard.associate = (models) => {
    SavedCard.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return SavedCard;
};
