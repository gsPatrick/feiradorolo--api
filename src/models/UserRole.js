'use strict';

/**
 * user_roles — papéis atribuídos a um usuário. `expires_at` permite papéis
 * temporários (ex.: acesso de suporte por período). `assigned_by` audita quem
 * concedeu.
 */
module.exports = (sequelize, DataTypes) => {
  const UserRole = sequelize.define(
    'UserRole',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      role_id: { type: DataTypes.UUID, allowNull: false },
      assigned_by: { type: DataTypes.UUID, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'user_roles',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['user_id', 'role_id'] },
        { fields: ['role_id'] },
        { fields: ['expires_at'] },
      ],
    }
  );

  UserRole.associate = (models) => {
    UserRole.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserRole.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
    UserRole.belongsTo(models.User, { foreignKey: 'assigned_by', as: 'grantedBy' });
  };

  return UserRole;
};
