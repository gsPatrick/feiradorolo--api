'use strict';

/**
 * Provider ReceitaWS — consulta pública de CNPJ na Receita Federal.
 *
 *   GET https://receitaws.com.br/v1/cnpj/<14 dígitos>
 *
 * A API gratuita só cobre CNPJ (PJ); CPF não é consultável aqui. O endpoint
 * grátis tem rate-limit (3 req/min) e pode responder { status: 'ERROR' }.
 * Esta função NUNCA lança: erros/rate-limit retornam { ok: false, error }.
 */
const axios = require('axios');
const logger = require('../../utils/logger');

const BASE_URL = 'https://receitaws.com.br/v1/cnpj';

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

/**
 * Consulta um CNPJ na ReceitaWS.
 * @param {string} cnpj CNPJ com ou sem máscara.
 * @returns {Promise<{ok:boolean,status?:string,nome?:string,situacao?:string,raw?:object,error?:string}>}
 */
async function lookupCnpj(cnpj) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) {
    return { ok: false, error: 'CNPJ deve conter 14 dígitos.' };
  }

  try {
    const { data } = await axios.get(`${BASE_URL}/${digits}`, {
      timeout: 15000,
      headers: { accept: 'application/json' },
    });

    // A ReceitaWS sinaliza falha lógica com status: 'ERROR' (HTTP 200).
    if (data && data.status === 'ERROR') {
      return { ok: false, error: data.message || 'CNPJ não encontrado na Receita.', raw: data };
    }

    return {
      ok: true,
      status: data && data.status, // 'OK'
      nome: data && (data.nome || data.fantasia) ? data.nome || data.fantasia : null,
      situacao: data && data.situacao ? String(data.situacao).toUpperCase() : null, // ex.: 'ATIVA'
      raw: data,
    };
  } catch (err) {
    // 429 = rate-limit da API gratuita; demais erros de rede/timeout.
    const httpStatus = err && err.response && err.response.status;
    const error =
      httpStatus === 429
        ? 'Limite de consultas à Receita atingido. Tente novamente em instantes.'
        : (err && err.message) || 'Falha ao consultar a Receita.';
    logger.warn(`ReceitaWS lookup falhou (cnpj=${digits}, http=${httpStatus || 'n/a'}): ${error}`);
    return { ok: false, error };
  }
}

module.exports = { lookupCnpj };
