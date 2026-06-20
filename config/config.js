'use strict';

// Configuração consumida pelo sequelize-cli (migrations/seeders) e pelo
// config/database.js. A conexão usa sempre DATABASE_URL (Neon/Postgres).
require('dotenv').config();

const define = {
  underscored: true, // colunas em snake_case (created_at, seller_id, ...)
  timestamps: true,
};

const pool = { max: 10, min: 0, acquire: 30000, idle: 10000 };

// Neon exige SSL. Em ambiente local sem SSL, defina DB_SSL=false.
const ssl = process.env.DB_SSL === 'false'
  ? {}
  : { ssl: { require: true, rejectUnauthorized: false } };

const common = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  define,
  pool,
  dialectOptions: ssl,
  logging: process.env.DB_LOGGING === 'true' ? console.log : false,
};

module.exports = {
  development: { ...common },
  test: { ...common, logging: false },
  // Produção respeita DB_SSL (use DB_SSL=false para Postgres sem SSL).
  production: { ...common },
};
