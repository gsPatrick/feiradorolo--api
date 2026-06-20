'use strict';

/** favorites — produtos favoritados por usuário (lista de desejos). */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('favorites', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      product_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'products', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('favorites', ['user_id']);
    await queryInterface.addIndex('favorites', ['user_id', 'product_id'], { unique: true, name: 'favorites_user_product_unique' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('favorites');
  },
};
