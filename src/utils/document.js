'use strict';

/**
 * Validação matemática de CPF e CNPJ (dígitos verificadores), independente de
 * qualquer API externa. Ignora máscara (pontos, traços, barras) e rejeita
 * sequências de dígitos repetidos (ex.: 00000000000), que passam no cálculo
 * dos DVs mas nunca são documentos reais.
 *
 * Funções puras: recebem string (com ou sem máscara) e devolvem boolean.
 */

/** Mantém apenas os dígitos de uma string. */
function onlyDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/** true se todos os dígitos forem iguais (ex.: '111...'). */
function allSameDigits(digits) {
  return digits.length > 0 && /^(\d)\1+$/.test(digits);
}

/**
 * Valida CPF pelos dois dígitos verificadores.
 * @param {string} cpf CPF com ou sem máscara.
 * @returns {boolean}
 */
function isValidCPF(cpf) {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return false;
  if (allSameDigits(d)) return false;

  const calcCheckDigit = (length) => {
    let sum = 0;
    // Pesos decrescentes a partir de (length + 1).
    for (let i = 0; i < length; i += 1) {
      sum += Number(d[i]) * (length + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 || rest === 11 ? 0 : rest;
  };

  const dv1 = calcCheckDigit(9);
  if (dv1 !== Number(d[9])) return false;
  const dv2 = calcCheckDigit(10);
  if (dv2 !== Number(d[10])) return false;

  return true;
}

/**
 * Valida CNPJ pelos dois dígitos verificadores.
 * @param {string} cnpj CNPJ com ou sem máscara.
 * @returns {boolean}
 */
function isValidCNPJ(cnpj) {
  const d = onlyDigits(cnpj);
  if (d.length !== 14) return false;
  if (allSameDigits(d)) return false;

  // Pesos oficiais para o 1º e o 2º dígito verificador.
  const WEIGHTS_1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const WEIGHTS_2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const calcCheckDigit = (weights) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i += 1) {
      sum += Number(d[i]) * weights[i];
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const dv1 = calcCheckDigit(WEIGHTS_1);
  if (dv1 !== Number(d[12])) return false;
  const dv2 = calcCheckDigit(WEIGHTS_2);
  if (dv2 !== Number(d[13])) return false;

  return true;
}

module.exports = { onlyDigits, isValidCPF, isValidCNPJ };
