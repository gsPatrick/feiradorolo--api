'use strict';

/**
 * permissions — permissões atômicas no formato `module.action`
 * (ex.: 'orders.view', 'revenue.manage'). `module` mapeia as abas do admin e as
 * features da engine; `action` é view/manage/etc. São criadas por seed
 * (is_system) e referenciadas por papéis e overrides de usuário.
 */
module.exports = (sequelize, DataTypes) => {
  const Permission = sequelize.define(
    'Permission',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      key: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(120), allowNull: false },
      description: { type: DataTypes.STRING(255), allowNull: true },
      module: { type: DataTypes.STRING(60), allowNull: false }, // ex.: orders, revenue
      action: { type: DataTypes.STRING(40), allowNull: false }, // ex.: view, manage
      is_system: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    {
      tableName: 'permissions',
      underscored: true,
      timestamps: true,
      indexes: [{ fields: ['key'] }, { fields: ['module'] }, { fields: ['action'] }],
    }
  );

  Permission.associate = (models) => {
    Permission.belongsToMany(models.Role, {
      through: models.RolePermission,
      foreignKey: 'permission_id',
      otherKey: 'role_id',
      as: 'roles',
    });
    Permission.belongsToMany(models.User, {
      through: models.UserPermission,
      foreignKey: 'permission_id',
      otherKey: 'user_id',
      as: 'users',
    });
  };

  return Permission;
};
