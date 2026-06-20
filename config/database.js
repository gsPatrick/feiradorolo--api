'use strict';

// Instância única do Sequelize usada pela aplicação (models/index.js).
const { Sequelize } = require('sequelize');
const configs = require('./config');

const env = process.env.NODE_ENV || 'development';
const config = configs[env];

const sequelize = config.use_env_variable
  ? new Sequelize(process.env[config.use_env_variable], config)
  : new Sequelize(config.database, config.username, config.password, config);

module.exports = { sequelize, Sequelize, config };
