'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('field_definitions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      category_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'categories', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING(80), allowNull: false },
      label: { type: Sequelize.STRING(120), allowNull: false },
      field_type: { type: Sequelize.ENUM('text', 'number', 'boolean', 'select', 'multiselect', 'date', 'range'), allowNull: false, defaultValue: 'text' },
      options: { type: Sequelize.JSONB },
      validation: { type: Sequelize.JSONB },
      unit: { type: Sequelize.STRING(20) },
      placeholder: { type: Sequelize.STRING(120) },
      help_text: { type: Sequelize.STRING(255) },
      is_required: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_filterable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      is_searchable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
    });

    await queryInterface.addIndex('field_definitions', ['category_id']);
    await queryInterface.addIndex('field_definitions', ['category_id', 'name'], { unique: true, name: 'field_definitions_category_name_unique' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('field_definitions');
  },
};
