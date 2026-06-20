'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('shipments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      order_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'orders', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      provider: { type: Sequelize.ENUM('melhor_envio'), allowNull: false, defaultValue: 'melhor_envio' },
      external_id: { type: Sequelize.STRING(120) },
      service_name: { type: Sequelize.STRING(60) },
      service_code: { type: Sequelize.STRING(40) },
      tracking_code: { type: Sequelize.STRING(80) },
      label_url: { type: Sequelize.STRING },
      status: { type: Sequelize.ENUM('pending', 'purchased', 'posted', 'in_transit', 'delivered', 'cancelled', 'returned'), allowNull: false, defaultValue: 'pending' },
      cost: { type: Sequelize.DECIMAL(12, 2) },
      estimated_delivery_days: { type: Sequelize.INTEGER },
      from_address: { type: Sequelize.JSONB },
      to_address: { type: Sequelize.JSONB },
      dimensions: { type: Sequelize.JSONB },
      payload: { type: Sequelize.JSONB },
      posted_at: { type: Sequelize.DATE },
      delivered_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('shipments', ['order_id']);
    await queryInterface.addIndex('shipments', ['tracking_code']);
    await queryInterface.addIndex('shipments', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('shipments');
  },
};
