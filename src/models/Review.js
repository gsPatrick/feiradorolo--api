'use strict';

/** reviews — avaliações de produtos. */
module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      product_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      order_id: { type: DataTypes.UUID, allowNull: true },
      rating: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 5 } },
      title: { type: DataTypes.STRING(120), allowNull: true },
      comment: { type: DataTypes.TEXT, allowNull: true },
      images: { type: DataTypes.JSONB, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'approved' },
    },
    {
      tableName: 'reviews',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['product_id'] }, { fields: ['user_id'] }, { fields: ['status'] }],
    }
  );

  Review.associate = (models) => {
    Review.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    Review.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
  };

  return Review;
};
