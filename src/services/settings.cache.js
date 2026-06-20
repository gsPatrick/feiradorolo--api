'use strict';

/**
 * Engine de Configurações Dinâmicas (cache em memória / singleton).
 *
 * Lê do banco as tabelas de parametrização e mantém um cache com TTL curto,
 * evitando consultar o PostgreSQL a cada requisição. Toda escrita feita pela
 * feature platform-settings deve chamar `invalidate()` para forçar releitura.
 *
 * É a ÚNICA fonte que os services de negócio usam para obter comissão, frete,
 * destaques, precificação de categoria e credenciais do gateway/integrações.
 */
const db = require('../models');
const { decrypt } = require('../utils/crypto');
const logger = require('../utils/logger');

const TTL_MS = Number(process.env.SETTINGS_CACHE_TTL_MS || 60000);

const store = new Map(); // namespace -> { at, data }

function fresh(ns) {
  const e = store.get(ns);
  return e && Date.now() - e.at < TTL_MS ? e.data : null;
}
function put(ns, data) {
  store.set(ns, { at: Date.now(), data });
  return data;
}

/** Invalida tudo (ou um namespace específico). */
function invalidate(ns) {
  if (ns) store.delete(ns);
  else store.clear();
}

/* --------------------------- platform_settings --------------------------- */
async function settingsMap() {
  const cached = fresh('settings');
  if (cached) return cached;
  const rows = await db.PlatformSetting.findAll();
  const map = {};
  for (const r of rows) map[r.key] = r.value;
  return put('settings', map);
}

async function get(key, fallback = null) {
  const map = await settingsMap();
  return key in map && map[key] !== null ? map[key] : fallback;
}
async function getNumber(key, fallback = 0) {
  const v = await get(key, fallback);
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
async function getBool(key, fallback = false) {
  const v = await get(key, fallback);
  return v === true || v === 'true' || v === 1;
}

/* ---------------------------- commission_rules --------------------------- */
async function commissionRules() {
  const cached = fresh('commission');
  if (cached) return cached;
  const rows = await db.CommissionRule.findAll({ where: { is_active: true }, order: [['priority', 'DESC']] });
  return put('commission', rows.map((r) => r.toJSON()));
}

/**
 * Resolve a comissão aplicável por especificidade (categoria+tier > categoria >
 * tier > global), respeitando `priority`. Retorna percentual e prazo de escrow.
 */
async function resolveCommission({ categoryId = null, sellerTier = 'standard' } = {}) {
  const rules = await commissionRules();
  const match = (r) => {
    if (r.scope === 'global') return true;
    if (r.scope === 'seller_tier') return r.seller_tier === sellerTier;
    if (r.scope === 'category') return r.category_id === categoryId;
    if (r.scope === 'category_seller_tier') return r.category_id === categoryId && r.seller_tier === sellerTier;
    return false;
  };
  const specificity = { category_seller_tier: 4, category: 3, seller_tier: 2, global: 1 };
  const candidates = rules.filter(match).sort(
    (a, b) => (specificity[b.scope] - specificity[a.scope]) || (b.priority - a.priority)
  );
  const chosen = candidates[0];
  const holdDays = chosen && chosen.escrow_hold_days != null
    ? chosen.escrow_hold_days
    : await getNumber('escrow.hold_days', 7);
  return {
    commissionPercent: chosen ? Number(chosen.commission_percent) : await getNumber('commission.standard', 10),
    escrowHoldDays: Number(holdDays),
    rule: chosen || null,
  };
}

/* ---------------------------- shipping_settings -------------------------- */
async function shipping() {
  const cached = fresh('shipping');
  if (cached) return cached;
  const row = await db.ShippingSetting.findOne({ where: { is_active: true }, order: [['created_at', 'ASC']] });
  return put('shipping', row ? row.toJSON() : null);
}

/* ---------------------------- highlight_packages ------------------------- */
async function highlightPackages() {
  const cached = fresh('highlights');
  if (cached) return cached;
  const rows = await db.HighlightPackage.findAll({ where: { is_active: true }, order: [['sort_order', 'ASC']] });
  return put('highlights', rows.map((r) => r.toJSON()));
}
async function highlight(tier) {
  return (await highlightPackages()).find((h) => h.tier === tier) || null;
}

/* ---------------------------- category_pricing --------------------------- */
async function categoryPricing(categoryId) {
  const cached = fresh('catpricing');
  let list = cached;
  if (!list) {
    const rows = await db.CategoryPricing.findAll();
    list = put('catpricing', rows.map((r) => r.toJSON()));
  }
  return list.find((c) => c.category_id === categoryId) || null;
}

/* ------------------------ payment_gateway_settings ----------------------- */
/** Gateway ativo com segredos JÁ DECIFRADOS (uso interno nos providers). */
async function activeGateway(provider = 'mercado_pago') {
  const cached = fresh('gateway');
  if (cached && cached.provider === provider) return cached;
  const row = await db.PaymentGatewaySetting.findOne({ where: { provider, is_active: true } });
  if (!row) return null;
  const g = {
    provider: row.provider,
    environment: row.environment,
    publicKey: row.public_key,
    accessToken: decrypt(row.access_token_encrypted),
    clientId: row.client_id,
    clientSecret: decrypt(row.client_secret_encrypted),
    webhookSecret: decrypt(row.webhook_secret_encrypted),
    extra: row.extra_encrypted ? safeJson(decrypt(row.extra_encrypted)) : null,
  };
  return put('gateway', g);
}

/* ------------------------- integration_settings -------------------------- */
async function integration(service) {
  const ns = `integration:${service}`;
  const cached = fresh(ns);
  if (cached) return cached;
  const row = await db.IntegrationSetting.findOne({ where: { service, is_active: true } });
  if (!row) return put(ns, null);
  const data = {
    service: row.service,
    environment: row.environment,
    config: row.config || {},
    credentials: row.credentials_encrypted ? safeJson(decrypt(row.credentials_encrypted)) : {},
  };
  return put(ns, data);
}

function safeJson(txt) {
  try {
    return JSON.parse(txt);
  } catch (e) {
    logger.warn('settings.cache: credencial decifrada não é JSON válido');
    return {};
  }
}

module.exports = {
  invalidate,
  get,
  getNumber,
  getBool,
  resolveCommission,
  shipping,
  highlightPackages,
  highlight,
  categoryPricing,
  activeGateway,
  integration,
};
