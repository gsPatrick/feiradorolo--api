'use strict';

/** Rotas públicas FIPE (sem auth). Montado em /fipe. */
const { Router } = require('express');
const controller = require('./fipe.controller');

const router = Router();

// GET /fipe/marcas?tipo=carros
router.get('/marcas', controller.marcas);
// GET /fipe/modelos?tipo=&marca=
router.get('/modelos', controller.modelos);
// GET /fipe/anos?tipo=&marca=&modelo=
router.get('/anos', controller.anos);
// GET /fipe/valor?tipo=&marca=&modelo=&ano=
router.get('/valor', controller.valor);

module.exports = router;
