'use strict';

/** Configuração pública para o frontend (platform_settings com is_public=true). */
const { Op } = require('sequelize');
const db = require('../../models');

/** Mapa { key: value } das settings públicas (value JSONB já parseado). */
async function getPublicSettings() {
  const rows = await db.PlatformSetting.findAll({
    where: { is_public: true },
    attributes: ['key', 'value'],
  });
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return map;
}

/**
 * Taxas públicas (refletem o que o admin edita): comissão padrão, parcelas e
 * frete grátis. Usado em páginas que exibem esses valores (ex.: anunciar produto).
 */
async function getFees() {
  // Comissão padrão: regra ativa do tier 'standard'; senão, a de menor comissão ativa.
  let rule = await db.CommissionRule.findOne({
    where: { is_active: true, seller_tier: 'standard' },
    order: [['priority', 'DESC']],
  });
  if (!rule) {
    rule = await db.CommissionRule.findOne({
      where: { is_active: true },
      order: [['commission_percent', 'ASC']],
    });
  }
  const shipping = await db.ShippingSetting.findOne({ where: { is_active: true } });
  const settings = await getPublicSettings();
  return {
    commission_percent: rule ? Number(rule.commission_percent) : 10,
    max_installments: Number(settings['payment.max_installments']) || 12,
    free_shipping_enabled: shipping ? !!shipping.free_shipping_enabled : false,
    free_shipping_min_order:
      shipping && shipping.free_shipping_min_order != null ? Number(shipping.free_shipping_min_order) : null,
  };
}

module.exports = { getPublicSettings, getFees };
