'use strict';

/**
 * users — cadastro unificado de compradores e vendedores (papéis coexistem).
 *
 * Decisão de modelagem (regras/2): CPF e CNPJ são campos ESTRUTURADOS e
 * SEPARADOS. `person_type` define qual documento se aplica (PF -> cpf,
 * PJ -> cnpj). Ambos são únicos quando preenchidos.
 *
 * Verificação facial (regras/3): obrigatória para o VENDEDOR após a primeira
 * venda e para o COMPRADOR após a primeira compra. Os gatilhos são
 * registrados em `has_first_sale` / `has_first_purchase` e o status fica em
 * `seller_verification_status` / `buyer_verification_status`. O histórico
 * detalhado vive em facial_verifications.
 */
module.exports = (sequelize, DataTypes) => {
  const User = sequelize.define(
    'User',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      name: { type: DataTypes.STRING(180), allowNull: false },
      email: {
        type: DataTypes.STRING(180),
        allowNull: false,
        unique: true,
        validate: { isEmail: true },
      },
      phone: { type: DataTypes.STRING(20), allowNull: true },

      // Autenticação: senha local (hash) é opcional pois há login social Firebase.
      password_hash: { type: DataTypes.STRING, allowNull: true },
      firebase_uid: { type: DataTypes.STRING(128), allowNull: true, unique: true },

      // Documentos — separados e validados por person_type.
      person_type: {
        type: DataTypes.ENUM('individual', 'company'),
        allowNull: false,
        defaultValue: 'individual',
      },
      cpf: {
        type: DataTypes.STRING(11),
        allowNull: true,
        unique: true,
        validate: { len: [11, 11], isNumeric: true },
      },
      cnpj: {
        type: DataTypes.STRING(14),
        allowNull: true,
        unique: true,
        validate: { len: [14, 14], isNumeric: true },
      },
      legal_name: { type: DataTypes.STRING(180), allowNull: true }, // razão social (PJ)
      birth_date: { type: DataTypes.DATEONLY, allowNull: true },
      avatar_url: { type: DataTypes.STRING, allowNull: true },

      // Papéis e permissões.
      is_seller: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      seller_tier: {
        type: DataTypes.ENUM('standard', 'premium'),
        allowNull: false,
        defaultValue: 'standard', // standard=10% / premium=12% (defaults; ver platform_settings)
      },
      is_admin: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      admin_role: { type: DataTypes.ENUM('admin', 'moderator'), allowNull: true },
      // Shadowban: conteúdo do usuário fica oculto a terceiros sem ele saber.
      is_shadowbanned: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

      account_status: {
        type: DataTypes.ENUM('active', 'pending', 'suspended', 'banned'),
        allowNull: false,
        defaultValue: 'active',
      },

      email_verified_at: { type: DataTypes.DATE, allowNull: true },
      phone_verified_at: { type: DataTypes.DATE, allowNull: true },

      // Verificação facial obrigatória (gatilhos de primeira atividade).
      has_first_sale: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      has_first_purchase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      seller_verification_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'verified', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
      },
      buyer_verification_status: {
        type: DataTypes.ENUM('not_required', 'pending', 'verified', 'rejected'),
        allowNull: false,
        defaultValue: 'not_required',
      },

      // Geolocalização (Causa Animal e retirada local).
      latitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },
      longitude: { type: DataTypes.DECIMAL(10, 7), allowNull: true },

      // Endereço.
      zip_code: { type: DataTypes.STRING(9), allowNull: true },
      street: { type: DataTypes.STRING(180), allowNull: true },
      number: { type: DataTypes.STRING(20), allowNull: true },
      complement: { type: DataTypes.STRING(120), allowNull: true },
      neighborhood: { type: DataTypes.STRING(120), allowNull: true },
      city: { type: DataTypes.STRING(120), allowNull: true },
      state: { type: DataTypes.STRING(2), allowNull: true }, // UF
      country: { type: DataTypes.STRING(2), allowNull: false, defaultValue: 'BR' },

      last_login_at: { type: DataTypes.DATE, allowNull: true },
      metadata: { type: DataTypes.JSONB, allowNull: true },
    },
    {
      tableName: 'users',
      underscored: true,
      timestamps: true,
      paranoid: true, // soft delete (deleted_at)
      indexes: [
        { fields: ['email'] },
        { fields: ['cpf'] },
        { fields: ['cnpj'] },
        { fields: ['firebase_uid'] },
        { fields: ['account_status'] },
        { fields: ['is_seller'] },
      ],
    }
  );

  User.associate = (models) => {
    User.hasMany(models.Product, { foreignKey: 'seller_id', as: 'products' });
    User.hasMany(models.Order, { foreignKey: 'buyer_id', as: 'purchases' });
    User.hasMany(models.Order, { foreignKey: 'seller_id', as: 'sales' });
    User.hasMany(models.Payment, { foreignKey: 'user_id', as: 'payments' });
    User.hasMany(models.FacialVerification, { foreignKey: 'user_id', as: 'facialVerifications' });
    User.hasMany(models.PlanSubscription, { foreignKey: 'user_id', as: 'subscriptions' });
    User.hasMany(models.Notification, { foreignKey: 'user_id', as: 'notifications' });
    User.hasMany(models.DeviceToken, { foreignKey: 'user_id', as: 'devices' });
    User.hasMany(models.UserBan, { foreignKey: 'user_id', as: 'bans' });
    User.hasMany(models.SecurityLog, { foreignKey: 'user_id', as: 'securityLogs' });
    User.hasOne(models.SellerPaymentAccount, { foreignKey: 'user_id', as: 'paymentAccount' });

    // RBAC granular: papéis + overrides diretos de permissão.
    User.belongsToMany(models.Role, {
      through: models.UserRole,
      foreignKey: 'user_id',
      otherKey: 'role_id',
      as: 'roles',
    });
    User.belongsToMany(models.Permission, {
      through: models.UserPermission,
      foreignKey: 'user_id',
      otherKey: 'permission_id',
      as: 'directPermissions',
    });
  };

  return User;
};
