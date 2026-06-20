'use strict';

/**
 * roles — papéis do RBAC granular. `level` define hierarquia (maior = mais
 * poder, útil para "não editar quem está acima"). `is_system` protege papéis
 * base de exclusão. Permissões efetivas = união das permissões dos papéis do
 * usuário, ajustada pelos overrides diretos (user_permissions).
 */
module.exports = (sequelize, DataTypes) => {
  const Role = sequelize.define(
    'Role',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(80), allowNull: false },
      slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
      description: { type: DataTypes.STRING(255), allowNull: true },
      level: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
      is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'roles',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['slug'] }, { fields: ['is_active'] }, { fields: ['level'] }],
    }
  );

  Role.associate = (models) => {
    Role.belongsToMany(models.Permission, {
      through: models.RolePermission,
      foreignKey: 'role_id',
      otherKey: 'permission_id',
      as: 'permissions',
    });
    Role.belongsToMany(models.User, {
      through: models.UserRole,
      foreignKey: 'role_id',
      otherKey: 'user_id',
      as: 'users',
    });
  };

  return Role;
};
