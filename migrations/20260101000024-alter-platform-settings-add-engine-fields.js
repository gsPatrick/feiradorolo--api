'use strict';

/**
 * Reforça platform_settings com metadados da engine dinâmica: valor padrão
 * (restaurar defaults), limites de validação e flags de governança/segurança.
 * @type {import('sequelize-cli').Migration}
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('platform_settings', 'default_value', { type: Sequelize.JSONB });
    await queryInterface.addColumn('platform_settings', 'min_value', { type: Sequelize.DECIMAL(14, 4) });
    await queryInterface.addColumn('platform_settings', 'max_value', { type: Sequelize.DECIMAL(14, 4) });
    await queryInterface.addColumn('platform_settings', 'options', { type: Sequelize.JSONB });
    await queryInterface.addColumn('platform_settings', 'unit', { type: Sequelize.STRING(20) });
    await queryInterface.addColumn('platform_settings', 'is_editable', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true });
    await queryInterface.addColumn('platform_settings', 'is_sensitive', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('platform_settings', 'is_encrypted', { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false });
    await queryInterface.addColumn('platform_settings', 'sort_order', { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('platform_settings', 'default_value');
    await queryInterface.removeColumn('platform_settings', 'min_value');
    await queryInterface.removeColumn('platform_settings', 'max_value');
    await queryInterface.removeColumn('platform_settings', 'options');
    await queryInterface.removeColumn('platform_settings', 'unit');
    await queryInterface.removeColumn('platform_settings', 'is_editable');
    await queryInterface.removeColumn('platform_settings', 'is_sensitive');
    await queryInterface.removeColumn('platform_settings', 'is_encrypted');
    await queryInterface.removeColumn('platform_settings', 'sort_order');
  },
};
