'use strict';

/** favorites — produtos favoritados por usuário. */
module.exports = (sequelize, DataTypes) => {
  const Favorite = sequelize.define(
    'Favorite',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      user_id: { type: DataTypes.UUID, allowNull: false },
      product_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'favorites',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['user_id'] },
        { unique: true, fields: ['user_id', 'product_id'] },
      ],
    }
  );

  Favorite.associate = (models) => {
    Favorite.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Favorite.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
  };

  return Favorite;
};
