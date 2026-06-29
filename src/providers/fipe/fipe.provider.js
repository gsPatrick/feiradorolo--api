'use strict';

/**
 * Provider FIPE — tabela de preços de veículos (parallelum, gratuita, sem chave).
 *
 *   Base: https://parallelum.com.br/fipe/api/v1
 *   Tipos: carros, motos, caminhoes
 *     GET /{tipo}/marcas
 *     GET /{tipo}/marcas/{marca}/modelos                  -> { modelos, anos }
 *     GET /{tipo}/marcas/{marca}/modelos/{modelo}/anos
 *     GET /{tipo}/marcas/{marca}/modelos/{modelo}/anos/{ano}
 *
 * A FIPE muda só 1x/mês e o tier gratuito tem rate-limit, então as respostas
 * ficam em cache em memória (Map, TTL ~12h). Se a FIPE falhar/limitar, este
 * provider lança AppError 502 (FIPE_UNAVAILABLE) — nunca derruba o processo.
 */
const axios = require('axios');
const logger = require('../../utils/logger');
const AppError = require('../../utils/AppError');

const BASE_URL = 'https://parallelum.com.br/fipe/api/v1';
const TIMEOUT_MS = 12000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000; // ~12h
const TIPOS = ['carros', 'motos', 'caminhoes'];

const cache = new Map(); // key -> { expires, value }

/** Normaliza/valida o tipo do veículo (default carros). */
function normalizeTipo(tipo) {
  const t = String(tipo || 'carros').toLowerCase();
  return TIPOS.includes(t) ? t : 'carros';
}

/** GET com cache em memória + tratamento de erro -> AppError 502. */
async function fetchCached(path) {
  const cached = cache.get(path);
  if (cached && cached.expires > Date.now()) return cached.value;

  try {
    const { data } = await axios.get(`${BASE_URL}${path}`, {
      timeout: TIMEOUT_MS,
      headers: { accept: 'application/json' },
    });
    cache.set(path, { expires: Date.now() + CACHE_TTL_MS, value: data });
    return data;
  } catch (err) {
    const httpStatus = err && err.response && err.response.status;
    const reason =
      httpStatus === 429
        ? 'Limite de consultas à tabela FIPE atingido. Tente novamente em instantes.'
        : 'Tabela FIPE indisponível no momento.';
    logger.warn(`FIPE falhou (path=${path}, http=${httpStatus || 'n/a'}): ${err && err.message}`);
    throw new AppError(reason, 502, 'FIPE_UNAVAILABLE');
  }
}

/** Lista de marcas: [{ codigo, nome }]. */
async function marcas(tipo) {
  const t = normalizeTipo(tipo);
  const data = await fetchCached(`/${t}/marcas`);
  return Array.isArray(data) ? data : [];
}

/** Lista de modelos de uma marca: [{ codigo, nome }] (extraído de .modelos). */
async function modelos(tipo, marcaCodigo) {
  const t = normalizeTipo(tipo);
  const data = await fetchCached(`/${t}/marcas/${marcaCodigo}/modelos`);
  return (data && Array.isArray(data.modelos)) ? data.modelos : [];
}

/** Lista de anos de um modelo: [{ codigo, nome }]. */
async function anos(tipo, marcaCodigo, modeloCodigo) {
  const t = normalizeTipo(tipo);
  const data = await fetchCached(`/${t}/marcas/${marcaCodigo}/modelos/${modeloCodigo}/anos`);
  return Array.isArray(data) ? data : [];
}

/**
 * Valor FIPE de um veículo específico, normalizado.
 * @returns {Promise<{valor,marca,modelo,anoModelo,combustivel,codigoFipe,mesReferencia}>}
 */
async function valor(tipo, marcaCodigo, modeloCodigo, anoCodigo) {
  const t = normalizeTipo(tipo);
  const data = await fetchCached(
    `/${t}/marcas/${marcaCodigo}/modelos/${modeloCodigo}/anos/${anoCodigo}`,
  );
  return {
    valor: (data && data.Valor) || null,
    marca: (data && data.Marca) || null,
    modelo: (data && data.Modelo) || null,
    anoModelo: (data && data.AnoModelo) || null,
    combustivel: (data && data.Combustivel) || null,
    codigoFipe: (data && data.CodigoFipe) || null,
    mesReferencia: (data && data.MesReferencia) || null,
  };
}

module.exports = { marcas, modelos, anos, valor, TIPOS, normalizeTipo };
