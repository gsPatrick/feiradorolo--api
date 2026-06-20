'use strict';

/** reviews — avaliações de produtos (estrelas + comentário + fotos). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reviews', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      order_id: { type: Sequelize.UUID, allowNull: true },
      rating: { type: Sequelize.INTEGER, allowNull: false },
      title: { type: Sequelize.STRING(120), allowNull: true },
      comment: { type: Sequelize.TEXT, allowNull: true },
      images: { type: Sequelize.JSONB, allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'approved' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('reviews', ['product_id']);
    await queryInterface.addIndex('reviews', ['user_id']);
    await queryInterface.addIndex('reviews', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reviews');
  },
};
