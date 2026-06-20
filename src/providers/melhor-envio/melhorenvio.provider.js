'use strict';

/**
 * Provider do Melhor Envio. Credenciais via integration_settings
 * (service='melhor_envio'). O MARKUP é aplicado pelo shipment.service a partir
 * de shipping_settings; aqui retornamos a cotação bruta do provedor.
 */
const axios = require('axios');
const settings = require('../../services/settings.cache');
const AppError = require('../../utils/AppError');

const PROD = 'https://www.melhorenvio.com.br/api/v2';
const SANDBOX = 'https://sandbox.melhorenvio.com.br/api/v2';

async function client() {
  const cfg = await settings.integration('melhor_envio');
  const token = cfg && cfg.credentials && cfg.credentials.token;
  if (!token) throw new AppError('Integração Melhor Envio não configurada.', 503, 'SHIPPING_NOT_CONFIGURED');
  const base = cfg.environment === 'production' ? PROD : SANDBOX;
  return axios.create({
    baseURL: base,
    timeout: 20000,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'User-Agent': (cfg.config && cfg.config.userAgent) || 'Feira do Rolo (suporte@feiradorolo.com)',
    },
  });
}

/** Cotação. payload: { from:{postal_code}, to:{postal_code}, products:[{...}] } */
async function quote(payload) {
  const http = await client();
  const { data } = await http.post('/me/shipment/calculate', payload);
  return data; // array de serviços com price, delivery_time, ...
}

/** Adiciona itens ao carrinho de envio do Melhor Envio. */
async function addToCart(payload) {
  const http = await client();
  const { data } = await http.post('/me/cart', payload);
  return data;
}

/** Compra as etiquetas (checkout) de fretes no carrinho. */
async function checkout(orderIds) {
  const http = await client();
  const { data } = await http.post('/me/shipment/checkout', { orders: orderIds });
  return data;
}

/** Gera a etiqueta. */
async function generateLabel(orderIds) {
  const http = await client();
  const { data } = await http.post('/me/shipment/generate', { orders: orderIds });
  return data;
}

/** Link para impressão da etiqueta. */
async function printLabel(orderIds) {
  const http = await client();
  const { data } = await http.post('/me/shipment/print', { orders: orderIds });
  return data; // { url }
}

/** Rastreamento. */
async function track(orderIds) {
  const http = await client();
  const { data } = await http.post('/me/shipment/tracking', { orders: orderIds });
  return data;
}

module.exports = { quote, addToCart, checkout, generateLabel, printLabel, track };
