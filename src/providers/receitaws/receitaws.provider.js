'use strict';

/**
 * Provider ReceitaWS — consulta pública de CNPJ na Receita Federal.
 *
 *   GET https://receitaws.com.br/v1/cnpj/<14 dígitos>
 *
 * A API gratuita só cobre CNPJ (PJ); CPF não é consultável aqui. O endpoint
 * grátis tem rate-limit (3 req/min) e pode responder { status: 'ERROR' }.
 * Se houver token configurado (integration_settings service='receitaws' ou
 * env RECEITAWS_TOKEN), ele é enviado no header Authorization (tier comercial);
 * sem token, usa o tier público.
 *
 * Esta função NUNCA lança: erros/rate-limit retornam { ok: false, reason }.
 */
const axios = require('axios');
const logger = require('../../utils/logger');
const settings = require('../../services/settings.cache');

const BASE_URL = 'https://receitaws.com.br/v1/cnpj';
const TIMEOUT_MS = 12000;

const onlyDigits = (v) => String(v || '').replace(/\D/g, '');

/** Resolve o token (integration_settings tem prioridade; senão env; senão null). */
async function resolveToken() {
  try {
    const integ = await settings.integration('receitaws');
    if (integ) {
      const token =
        (integ.credentials && (integ.credentials.token || integ.credentials.api_token)) ||
        (integ.config && (integ.config.token || integ.config.api_token)) ||
        null;
      if (token) return token;
    }
  } catch (err) {
    logger.debug(`ReceitaWS: integration_settings indisponível (${err.message}); usando env/público.`);
  }
  return process.env.RECEITAWS_TOKEN || null;
}

/**
 * Consulta um CNPJ na ReceitaWS.
 * @param {string} cnpj CNPJ com ou sem máscara.
 * @returns {Promise<{ok:boolean,status?:string,situacao?:string,nome?:string,fantasia?:string,raw?:object,reason?:string}>}
 */
async function lookupCNPJ(cnpj) {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) {
    const reason = 'CNPJ deve conter 14 dígitos.';
    return { ok: false, reason, error: reason };
  }

  const headers = { accept: 'application/json' };
  const token = await resolveToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  try {
    const { data } = await axios.get(`${BASE_URL}/${digits}`, { timeout: TIMEOUT_MS, headers });

    // A ReceitaWS sinaliza falha lógica com status: 'ERROR' (HTTP 200).
    if (!data || data.status === 'ERROR') {
      const reason = (data && data.message) || 'CNPJ não encontrado na Receita.';
      return { ok: false, reason, error: reason, raw: data || null };
    }

    return {
      ok: data.status === 'OK',
      status: data.status, // 'OK'
      situacao: data.situacao ? String(data.situacao).toUpperCase() : null, // ex.: 'ATIVA'
      nome: data.nome || null, // razão social
      fantasia: data.fantasia || null, // nome fantasia
      raw: data,
    };
  } catch (err) {
    // 429 = rate-limit da API gratuita; demais erros de rede/timeout.
    const httpStatus = err && err.response && err.response.status;
    const reason =
      httpStatus === 429
        ? 'Limite de consultas à Receita atingido. Tente novamente em instantes.'
        : (err && err.message) || 'Falha ao consultar a Receita.';
    logger.warn(`ReceitaWS lookup falhou (cnpj=${digits}, http=${httpStatus || 'n/a'}): ${reason}`);
    return { ok: false, reason, error: reason };
  }
}

// Alias retrocompatível (algum código antigo pode importar lookupCnpj).
module.exports = { lookupCNPJ, lookupCnpj: lookupCNPJ };
