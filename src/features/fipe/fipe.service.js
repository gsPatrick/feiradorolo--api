'use strict';

/** Service FIPE — fina camada sobre o provider (cache/normalização ficam lá). */
const provider = require('../../providers/fipe/fipe.provider');

const getMarcas = (tipo) => provider.marcas(tipo);
const getModelos = (tipo, marca) => provider.modelos(tipo, marca);
const getAnos = (tipo, marca, modelo) => provider.anos(tipo, marca, modelo);
const getValor = (tipo, marca, modelo, ano) => provider.valor(tipo, marca, modelo, ano);

module.exports = { getMarcas, getModelos, getAnos, getValor };
