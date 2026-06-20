'use strict';

/**
 * user_permissions — overrides diretos por usuário, além dos papéis.
 * `effect` = 'allow' concede uma permissão extra; 'deny' REVOGA uma permissão
 * herdada de papel (deny vence allow na resolução). `expires_at` para acessos
 * temporários. É o que garante granularidade fina ("este usuário, esta exceção").
 */
module.exports = (sequelize, DataTypes) => {
  const UserPermission = sequelize.define(
    'UserPermission',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      user_id: { type: DataTypes.UUID, allowNull: false },
      permission_id: { type: DataTypes.UUID, allowNull: false },
      effect: {
        type: DataTypes.ENUM('allow', 'deny'),
        allowNull: false,
        defaultValue: 'allow',
      },
      assigned_by: { type: DataTypes.UUID, allowNull: true },
      expires_at: { type: DataTypes.DATE, allowNull: true },
    },
    {
      tableName: 'user_permissions',
      underscored: true,
      timestamps: true,
      indexes: [
        { unique: true, fields: ['user_id', 'permission_id'] },
        { fields: ['permission_id'] },
        { fields: ['effect'] },
      ],
    }
  );

  UserPermission.associate = (models) => {
    UserPermission.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    UserPermission.belongsTo(models.Permission, { foreignKey: 'permission_id', as: 'permission' });
    UserPermission.belongsTo(models.User, { foreignKey: 'assigned_by', as: 'grantedBy' });
  };

  return UserPermission;
};
