'use strict';

/** addresses — agenda de endereços de entrega do usuário. */
module.exports = (sequelize, DataTypes) => {
  const Address = sequelize.define(
    'Address',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      label: { type: DataTypes.STRING(60), allowNull: true },
      recipient_name: { type: DataTypes.STRING(180), allowNull: true },
      phone: { type: DataTypes.STRING(20), allowNull: true },
      zip_code: { type: DataTypes.STRING(9), allowNull: false },
      street: { type: DataTypes.STRING(180), allowNull: false },
      number: { type: DataTypes.STRING(20), allowNull: true },
      complement: { type: DataTypes.STRING(120), allowNull: true },
      neighborhood: { type: DataTypes.STRING(120), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: false },
      state: { type: DataTypes.STRING(2), allowNull: false },
      country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'BR' },
      is_default: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    {
      tableName: 'addresses',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['user_id'] }],
    }
  );

  Address.associate = (models) => {
    Address.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
  };

  return Address;
};
