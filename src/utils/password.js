'use strict';

const bcrypt = require('bcryptjs');

const ROUNDS = 10;

const hash = (plain) => bcrypt.hash(plain, ROUNDS);
const compare = (plain, hashed) => bcrypt.compare(plain, hashed || '');

module.exports = { hash, compare };
