'use strict';

/** product_questions — perguntas e respostas sobre um produto. */
module.exports = (sequelize, DataTypes) => {
  const ProductQuestion = sequelize.define(
    'ProductQuestion',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      product_id: { type: DataTypes.UUID, allowNull: false },
      user_id: { type: DataTypes.UUID, allowNull: false },
      question: { type: DataTypes.TEXT, allowNull: false },
      answer: { type: DataTypes.TEXT, allowNull: true },
      answered_at: { type: DataTypes.DATE, allowNull: true },
      answered_by: { type: DataTypes.UUID, allowNull: true },
      status: { type: DataTypes.ENUM('pending', 'answered', 'hidden'), allowNull: false, defaultValue: 'pending' },
    },
    {
      tableName: 'product_questions',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['product_id'] }, { fields: ['user_id'] }],
    }
  );

  ProductQuestion.associate = (models) => {
    ProductQuestion.belongsTo(models.User, { foreignKey: 'user_id', as: 'asker' });
    ProductQuestion.belongsTo(models.Product, { foreignKey: 'product_id', as: 'product' });
  };

  return ProductQuestion;
};
