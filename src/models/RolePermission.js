'use strict';

/** role_permissions — vínculo N:N entre papéis e permissões. */
module.exports = (sequelize, DataTypes) => {
  const RolePermission = sequelize.define(
    'RolePermission',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      role_id: { type: DataTypes.UUID, allowNull: false },
      permission_id: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: 'role_permissions',
      underscored: true,
      timestamps: true,
      updatedAt: false,
      indexes: [
        { unique: true, fields: ['role_id', 'permission_id'] },
        { fields: ['permission_id'] },
      ],
    }
  );

  RolePermission.associate = (models) => {
    RolePermission.belongsTo(models.Role, { foreignKey: 'role_id', as: 'role' });
    RolePermission.belongsTo(models.Permission, { foreignKey: 'permission_id', as: 'permission' });
  };

  return RolePermission;
};
