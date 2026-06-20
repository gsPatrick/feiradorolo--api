'use strict';

/** product_questions — perguntas e respostas públicas sobre um produto. */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('product_questions', {
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
      question: { type: Sequelize.TEXT, allowNull: false },
      answer: { type: Sequelize.TEXT, allowNull: true },
      answered_at: { type: Sequelize.DATE, allowNull: true },
      answered_by: { type: Sequelize.UUID, allowNull: true },
      status: { type: Sequelize.ENUM('pending', 'answered', 'hidden'), allowNull: false, defaultValue: 'pending' },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });
    await queryInterface.addIndex('product_questions', ['product_id']);
    await queryInterface.addIndex('product_questions', ['user_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('product_questions');
  },
};
