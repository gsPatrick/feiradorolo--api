'use strict';

/**
 * field_definitions — especificações dinâmicas por categoria (aba Especificações
 * do admin). Define os campos que cada produto da categoria pode/precisa
 * preencher; os valores são gravados em products.specifications (JSONB).
 */
module.exports = (sequelize, DataTypes) => {
  const FieldDefinition = sequelize.define(
    'FieldDefinition',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      category_id: { type: DataTypes.UUID, allowNull: false },
      name: { type: DataTypes.STRING(80), allowNull: false }, // chave (ex.: 'rooms')
      label: { type: DataTypes.STRING(120), allowNull: false },
      field_type: {
        type: DataTypes.ENUM('text', 'number', 'boolean', 'select', 'multiselect', 'date', 'range'),
        allowNull: false,
        defaultValue: 'text',
      },
      options: { type: DataTypes.JSONB, allowNull: true }, // para select/multiselect
      validation: { type: DataTypes.JSONB, allowNull: true }, // { min, max, regex, ... }
      unit: { type: DataTypes.STRING(20), allowNull: true }, // ex.: m², km
      placeholder: { type: DataTypes.STRING(120), allowNull: true },
      help_text: { type: DataTypes.STRING(255), allowNull: true },
      is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_filterable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_searchable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'field_definitions',
      underscored: true,
      timestamps: true,
      indexes: [
        { fields: ['category_id'] },
        { unique: true, fields: ['category_id', 'name'] },
      ],
    }
  );

  FieldDefinition.associate = (models) => {
    FieldDefinition.belongsTo(models.Category, { foreignKey: 'category_id', as: 'category' });
  };

  return FieldDefinition;
};
