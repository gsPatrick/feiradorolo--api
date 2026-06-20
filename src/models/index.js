'use strict';

// Carrega todos os models da pasta, inicializa cada um com a instância única
// do Sequelize e aplica as associações (cada model expõe um método estático
// `associate(models)`).
const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const { sequelize } = require('../../config/database');

const basename = path.basename(__filename);
const db = {};

fs.readdirSync(__dirname)
  .filter(
    (file) =>
      file.indexOf('.') !== 0 &&
      file !== basename &&
      file.slice(-3) === '.js' &&
      file.indexOf('.test.js') === -1
  )
  .forEach((file) => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.keys(db).forEach((name) => {
  if (typeof db[name].associate === 'function') {
    db[name].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
