'use strict';

/**
 * Service do módulo ADMIN `platform-settings`.
 *
 * Concentra toda a regra de negócio das abas de parametrização da plataforma:
 * settings genéricos (chave/valor), comissões, destaques, precificação por
 * categoria, frete, gateways de pagamento, integrações externas e palavras
 * bloqueadas. Os controllers são finos (apenas HTTP); aqui ficam validação
 * severa, criptografia de segredos, auditoria e invalidação de cache.
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const crypto = require('../../utils/crypto');
const settingsCache = require('../../services/settings.cache');
const moderationService = require('../../services/moderation.service');

const ENCRYPTED_PLACEHOLDER = '[encrypted]';

/* ------------------------------------------------------------------------- */
/* Helpers genéricos                                                          */
/* ------------------------------------------------------------------------- */

function invalidateCache() {
  settingsCache.invalidate();
}

/**
 * Registra uma alteração na trilha de auditoria (setting_change_logs).
 * NUNCA grava segredos decifrados — passe '[encrypted]' em old_value/new_value
 * quando o campo for sensível.
 */
async function logChange(entity, { entity_id, setting_key, action, old_value, new_value, changed_by, req } = {}, options = {}) {
  return db.SettingChangeLog.create(
    {
      entity,
      entity_id: entity_id != null ? String(entity_id) : null,
      setting_key: setting_key != null ? String(setting_key) : null,
      action: action || 'update',
      old_value: old_value === undefined ? null : old_value,
      new_value: new_value === undefined ? null : new_value,
      changed_by: changed_by || (req && req.user ? req.user.id : null),
      ip_address: req ? req.ip || (req.connection && req.connection.remoteAddress) || null : null,
      user_agent: req && req.headers ? req.headers['user-agent'] || null : null,
    },
    options
  );
}

function actorId(req) {
  return req && req.user ? req.user.id : null;
}

function toNumberOrThrow(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw AppError.unprocessable(`Campo "${field}" deve ser numérico.`, 'INVALID_NUMBER', { field });
  }
  return n;
}

function assertRange(value, field, min, max) {
  const n = toNumberOrThrow(value, field);
  if (min != null && n < min) {
    throw AppError.unprocessable(`Campo "${field}" deve ser >= ${min}.`, 'OUT_OF_RANGE', { field, min });
  }
  if (max != null && n > max) {
    throw AppError.unprocessable(`Campo "${field}" deve ser <= ${max}.`, 'OUT_OF_RANGE', { field, max });
  }
  return n;
}

/* ------------------------------------------------------------------------- */
/* 1) platform_settings — engine genérico chave/valor                         */
/* ------------------------------------------------------------------------- */

async function listSettings() {
  return db.PlatformSetting.findAll({ order: [['group', 'ASC'], ['sort_order', 'ASC'], ['key', 'ASC']] });
}

async function getSetting(key) {
  const row = await db.PlatformSetting.findOne({ where: { key } });
  if (!row) throw AppError.notFound('Configuração não encontrada.', 'SETTING_NOT_FOUND');
  return row;
}

/**
 * Validação severa do valor de um platform_setting, respeitando value_type,
 * min_value/max_value e options (enum). Retorna o valor coagido para o tipo.
 */
function coerceAndValidateSettingValue(row, rawValue) {
  if (rawValue === undefined) {
    throw AppError.unprocessable('Campo "value" é obrigatório.', 'VALUE_REQUIRED', { field: 'value' });
  }

  let value = rawValue;
  const type = row.value_type;

  if (type === 'number' || type === 'percentage' || type === 'currency') {
    const n = toNumberOrThrow(value, 'value');
    if (type === 'percentage' && (n < 0 || n > 100)) {
      throw AppError.unprocessable('Percentual deve estar entre 0 e 100.', 'OUT_OF_RANGE', { field: 'value' });
    }
    if (type === 'currency' && n < 0) {
      throw AppError.unprocessable('Valor monetário não pode ser negativo.', 'OUT_OF_RANGE', { field: 'value' });
    }
    if (row.min_value != null && n < Number(row.min_value)) {
      throw AppError.unprocessable(`Valor deve ser >= ${row.min_value}.`, 'OUT_OF_RANGE', { field: 'value', min: Number(row.min_value) });
    }
    if (row.max_value != null && n > Number(row.max_value)) {
      throw AppError.unprocessable(`Valor deve ser <= ${row.max_value}.`, 'OUT_OF_RANGE', { field: 'value', max: Number(row.max_value) });
    }
    value = n;
  } else if (type === 'boolean') {
    if (typeof value === 'string') value = value === 'true' || value === '1';
    if (typeof value !== 'boolean') {
      if (value === 1 || value === 0) value = value === 1;
      else throw AppError.unprocessable('Valor deve ser booleano.', 'INVALID_BOOLEAN', { field: 'value' });
    }
  } else if (type === 'string') {
    if (typeof value !== 'string') value = String(value);
  }
  // type === 'json' => aceita qualquer estrutura serializável.

  // Enum de valores permitidos (options).
  if (Array.isArray(row.options) && row.options.length > 0) {
    const allowed = row.options.some((opt) => opt === value || (opt && typeof opt === 'object' && opt.value === value));
    if (!allowed) {
      throw AppError.unprocessable('Valor não está entre as opções permitidas.', 'NOT_IN_OPTIONS', { field: 'value', options: row.options });
    }
  }

  return value;
}

async function updateSetting(key, rawValue, req) {
  const row = await getSetting(key);

  if (row.is_editable === false) {
    throw AppError.forbidden('Esta configuração não é editável.', 'SETTING_NOT_EDITABLE');
  }

  const newValue = coerceAndValidateSettingValue(row, rawValue);
  const oldValue = row.value;

  const sensitive = row.is_sensitive || row.is_encrypted;

  await row.update({ value: newValue, updated_by: actorId(req) });

  await logChange('platform_setting', {
    entity_id: row.id,
    setting_key: row.key,
    action: 'update',
    old_value: sensitive ? ENCRYPTED_PLACEHOLDER : oldValue,
    new_value: sensitive ? ENCRYPTED_PLACEHOLDER : newValue,
    req,
  });

  invalidateCache();
  return row;
}

async function restoreSetting(key, req) {
  const row = await getSetting(key);

  if (row.is_editable === false) {
    throw AppError.forbidden('Esta configuração não é editável.', 'SETTING_NOT_EDITABLE');
  }

  const oldValue = row.value;
  const sensitive = row.is_sensitive || row.is_encrypted;

  await row.update({ value: row.default_value, updated_by: actorId(req) });

  await logChange('platform_setting', {
    entity_id: row.id,
    setting_key: row.key,
    action: 'restore_default',
    old_value: sensitive ? ENCRYPTED_PLACEHOLDER : oldValue,
    new_value: sensitive ? ENCRYPTED_PLACEHOLDER : row.default_value,
    req,
  });

  invalidateCache();
  return row;
}

/* ------------------------------------------------------------------------- */
/* 2) commission_rules                                                        */
/* ------------------------------------------------------------------------- */

const COMMISSION_SCOPES = ['global', 'category', 'seller_tier', 'category_seller_tier'];
const SELLER_TIERS = ['standard', 'premium'];

function validateCommissionPayload(data, { partial = false } = {}) {
  const out = {};

  if (!partial || data.name !== undefined) {
    if (!data.name || String(data.name).trim() === '') {
      throw AppError.unprocessable('Campo "name" é obrigatório.', 'VALUE_REQUIRED', { field: 'name' });
    }
    out.name = String(data.name).trim();
  }

  if (!partial || data.scope !== undefined) {
    const scope = data.scope || 'global';
    if (!COMMISSION_SCOPES.includes(scope)) {
      throw AppError.unprocessable('Escopo inválido.', 'INVALID_ENUM', { field: 'scope', allowed: COMMISSION_SCOPES });
    }
    out.scope = scope;
  }

  if (data.category_id !== undefined) out.category_id = data.category_id || null;

  if (data.seller_tier !== undefined) {
    if (data.seller_tier !== null && !SELLER_TIERS.includes(data.seller_tier)) {
      throw AppError.unprocessable('seller_tier inválido.', 'INVALID_ENUM', { field: 'seller_tier', allowed: SELLER_TIERS });
    }
    out.seller_tier = data.seller_tier || null;
  }

  if (!partial || data.commission_percent !== undefined) {
    if (data.commission_percent === undefined || data.commission_percent === null) {
      throw AppError.unprocessable('Campo "commission_percent" é obrigatório.', 'VALUE_REQUIRED', { field: 'commission_percent' });
    }
    out.commission_percent = assertRange(data.commission_percent, 'commission_percent', 0, 100);
  }

  if (data.min_commission_amount !== undefined) {
    out.min_commission_amount = data.min_commission_amount === null ? null : assertRange(data.min_commission_amount, 'min_commission_amount', 0, null);
  }
  if (data.max_commission_amount !== undefined) {
    out.max_commission_amount = data.max_commission_amount === null ? null : assertRange(data.max_commission_amount, 'max_commission_amount', 0, null);
  }

  if (data.escrow_hold_days !== undefined) {
    out.escrow_hold_days = data.escrow_hold_days === null ? null : assertRange(data.escrow_hold_days, 'escrow_hold_days', 0, 365);
  }

  if (data.priority !== undefined) out.priority = toNumberOrThrow(data.priority, 'priority');
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);

  return out;
}

async function listCommissionRules() {
  return db.CommissionRule.findAll({ order: [['priority', 'DESC'], ['created_at', 'ASC']] });
}

async function createCommissionRule(data, req) {
  const payload = validateCommissionPayload(data, { partial: false });
  payload.updated_by = actorId(req);
  const row = await db.CommissionRule.create(payload);

  await logChange('commission_rule', {
    entity_id: row.id,
    action: 'create',
    old_value: null,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function updateCommissionRule(id, data, req) {
  const row = await db.CommissionRule.findByPk(id);
  if (!row) throw AppError.notFound('Regra de comissão não encontrada.', 'COMMISSION_RULE_NOT_FOUND');

  const payload = validateCommissionPayload(data, { partial: true });
  payload.updated_by = actorId(req);

  const oldValue = row.toJSON();
  await row.update(payload);

  await logChange('commission_rule', {
    entity_id: row.id,
    action: 'update',
    old_value: oldValue,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function deleteCommissionRule(id, req) {
  const row = await db.CommissionRule.findByPk(id);
  if (!row) throw AppError.notFound('Regra de comissão não encontrada.', 'COMMISSION_RULE_NOT_FOUND');

  const oldValue = row.toJSON();
  await row.destroy();

  await logChange('commission_rule', {
    entity_id: id,
    action: 'delete',
    old_value: oldValue,
    new_value: null,
    req,
  });

  invalidateCache();
}

/* ------------------------------------------------------------------------- */
/* 3) highlight_packages                                                      */
/* ------------------------------------------------------------------------- */

const HIGHLIGHT_TIERS = ['silver', 'gold', 'diamond'];

function validateHighlightPayload(data, { partial = false } = {}) {
  const out = {};

  if (!partial || data.tier !== undefined) {
    if (!data.tier || !HIGHLIGHT_TIERS.includes(data.tier)) {
      throw AppError.unprocessable('tier inválido.', 'INVALID_ENUM', { field: 'tier', allowed: HIGHLIGHT_TIERS });
    }
    out.tier = data.tier;
  }

  if (!partial || data.name !== undefined) {
    if (!data.name || String(data.name).trim() === '') {
      throw AppError.unprocessable('Campo "name" é obrigatório.', 'VALUE_REQUIRED', { field: 'name' });
    }
    out.name = String(data.name).trim();
  }

  if (!partial || data.price !== undefined) {
    if (data.price === undefined || data.price === null) {
      throw AppError.unprocessable('Campo "price" é obrigatório.', 'VALUE_REQUIRED', { field: 'price' });
    }
    out.price = assertRange(data.price, 'price', 0, null);
  }

  if (data.currency !== undefined) out.currency = String(data.currency || 'BRL').toUpperCase().slice(0, 3);

  if (!partial || data.duration_days !== undefined) {
    if (data.duration_days === undefined || data.duration_days === null) {
      throw AppError.unprocessable('Campo "duration_days" é obrigatório.', 'VALUE_REQUIRED', { field: 'duration_days' });
    }
    out.duration_days = assertRange(data.duration_days, 'duration_days', 1, 365);
  }

  if (data.benefits !== undefined) out.benefits = data.benefits;
  if (data.sort_order !== undefined) out.sort_order = toNumberOrThrow(data.sort_order, 'sort_order');
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);

  return out;
}

async function listHighlightPackages() {
  return db.HighlightPackage.findAll({ order: [['sort_order', 'ASC'], ['created_at', 'ASC']] });
}

async function createHighlightPackage(data, req) {
  const payload = validateHighlightPayload(data, { partial: false });
  payload.updated_by = actorId(req);
  const row = await db.HighlightPackage.create(payload);

  await logChange('highlight_package', {
    entity_id: row.id,
    action: 'create',
    old_value: null,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function updateHighlightPackage(id, data, req) {
  const row = await db.HighlightPackage.findByPk(id);
  if (!row) throw AppError.notFound('Pacote de destaque não encontrado.', 'HIGHLIGHT_NOT_FOUND');

  const payload = validateHighlightPayload(data, { partial: true });
  payload.updated_by = actorId(req);

  const oldValue = row.toJSON();
  await row.update(payload);

  await logChange('highlight_package', {
    entity_id: row.id,
    action: 'update',
    old_value: oldValue,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function deleteHighlightPackage(id, req) {
  const row = await db.HighlightPackage.findByPk(id);
  if (!row) throw AppError.notFound('Pacote de destaque não encontrado.', 'HIGHLIGHT_NOT_FOUND');

  const oldValue = row.toJSON();
  await row.destroy();

  await logChange('highlight_package', {
    entity_id: id,
    action: 'delete',
    old_value: oldValue,
    new_value: null,
    req,
  });

  invalidateCache();
}

/* ------------------------------------------------------------------------- */
/* 4) category_pricing                                                        */
/* ------------------------------------------------------------------------- */

const PRICING_MODELS = ['free', 'commission', 'flat_fee', 'package'];

function validateCategoryPricingPayload(data, { partial = false } = {}) {
  const out = {};

  if (!partial || data.category_id !== undefined) {
    if (!data.category_id) {
      throw AppError.unprocessable('Campo "category_id" é obrigatório.', 'VALUE_REQUIRED', { field: 'category_id' });
    }
    out.category_id = data.category_id;
  }

  if (!partial || data.pricing_model !== undefined) {
    const model = data.pricing_model || 'commission';
    if (!PRICING_MODELS.includes(model)) {
      throw AppError.unprocessable('pricing_model inválido.', 'INVALID_ENUM', { field: 'pricing_model', allowed: PRICING_MODELS });
    }
    out.pricing_model = model;
  }

  if (!partial || data.listing_fee !== undefined) {
    out.listing_fee = data.listing_fee === undefined || data.listing_fee === null ? 0 : assertRange(data.listing_fee, 'listing_fee', 0, null);
  }

  if (data.currency !== undefined) out.currency = String(data.currency || 'BRL').toUpperCase().slice(0, 3);

  if (data.listing_duration_days !== undefined) {
    out.listing_duration_days = data.listing_duration_days === null ? null : assertRange(data.listing_duration_days, 'listing_duration_days', 1, 365);
  }
  if (data.listing_limit_free !== undefined) {
    out.listing_limit_free = data.listing_limit_free === null ? null : assertRange(data.listing_limit_free, 'listing_limit_free', 0, null);
  }
  if (data.requires_plan !== undefined) out.requires_plan = Boolean(data.requires_plan);
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);

  return out;
}

async function listCategoryPricing() {
  return db.CategoryPricing.findAll({ order: [['created_at', 'ASC']] });
}

async function createCategoryPricing(data, req) {
  const payload = validateCategoryPricingPayload(data, { partial: false });
  payload.updated_by = actorId(req);

  const existing = await db.CategoryPricing.findOne({ where: { category_id: payload.category_id } });
  if (existing) {
    throw AppError.conflict('Já existe precificação para esta categoria.', 'CATEGORY_PRICING_EXISTS');
  }

  const row = await db.CategoryPricing.create(payload);

  await logChange('category_pricing', {
    entity_id: row.id,
    action: 'create',
    old_value: null,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function updateCategoryPricing(id, data, req) {
  const row = await db.CategoryPricing.findByPk(id);
  if (!row) throw AppError.notFound('Precificação de categoria não encontrada.', 'CATEGORY_PRICING_NOT_FOUND');

  const payload = validateCategoryPricingPayload(data, { partial: true });
  payload.updated_by = actorId(req);

  const oldValue = row.toJSON();
  await row.update(payload);

  await logChange('category_pricing', {
    entity_id: row.id,
    action: 'update',
    old_value: oldValue,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function deleteCategoryPricing(id, req) {
  const row = await db.CategoryPricing.findByPk(id);
  if (!row) throw AppError.notFound('Precificação de categoria não encontrada.', 'CATEGORY_PRICING_NOT_FOUND');

  const oldValue = row.toJSON();
  await row.destroy();

  await logChange('category_pricing', {
    entity_id: id,
    action: 'delete',
    old_value: oldValue,
    new_value: null,
    req,
  });

  invalidateCache();
}

/* ------------------------------------------------------------------------- */
/* 5) shipping_settings                                                       */
/* ------------------------------------------------------------------------- */

function validateShippingPayload(data, { partial = false } = {}) {
  const out = {};

  if (!partial || data.name !== undefined) {
    out.name = data.name ? String(data.name).trim() : 'default';
  }
  if (data.provider !== undefined) out.provider = data.provider || 'melhor_envio';

  if (!partial || data.markup_percent !== undefined) {
    out.markup_percent = data.markup_percent === undefined || data.markup_percent === null ? 0 : assertRange(data.markup_percent, 'markup_percent', 0, 100);
  }
  if (!partial || data.markup_fixed !== undefined) {
    out.markup_fixed = data.markup_fixed === undefined || data.markup_fixed === null ? 0 : assertRange(data.markup_fixed, 'markup_fixed', 0, null);
  }

  if (data.free_shipping_enabled !== undefined) out.free_shipping_enabled = Boolean(data.free_shipping_enabled);
  if (data.free_shipping_min_order !== undefined) {
    out.free_shipping_min_order = data.free_shipping_min_order === null ? null : assertRange(data.free_shipping_min_order, 'free_shipping_min_order', 0, null);
  }
  if (data.free_shipping_categories !== undefined) out.free_shipping_categories = data.free_shipping_categories;

  if (data.max_weight_grams !== undefined) {
    out.max_weight_grams = data.max_weight_grams === null ? null : assertRange(data.max_weight_grams, 'max_weight_grams', 0, null);
  }
  if (data.max_declared_value !== undefined) {
    out.max_declared_value = data.max_declared_value === null ? null : assertRange(data.max_declared_value, 'max_declared_value', 0, null);
  }
  if (data.max_dimensions !== undefined) out.max_dimensions = data.max_dimensions;
  if (data.default_origin_zip !== undefined) out.default_origin_zip = data.default_origin_zip || null;
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);

  return out;
}

async function listShippingSettings() {
  return db.ShippingSetting.findAll({ order: [['created_at', 'ASC']] });
}

async function createShippingSetting(data, req) {
  const payload = validateShippingPayload(data, { partial: false });
  payload.updated_by = actorId(req);
  const row = await db.ShippingSetting.create(payload);

  await logChange('shipping_setting', {
    entity_id: row.id,
    action: 'create',
    old_value: null,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function updateShippingSetting(id, data, req) {
  const row = await db.ShippingSetting.findByPk(id);
  if (!row) throw AppError.notFound('Configuração de frete não encontrada.', 'SHIPPING_NOT_FOUND');

  const payload = validateShippingPayload(data, { partial: true });
  payload.updated_by = actorId(req);

  const oldValue = row.toJSON();
  await row.update(payload);

  await logChange('shipping_setting', {
    entity_id: row.id,
    action: 'update',
    old_value: oldValue,
    new_value: row.toJSON(),
    req,
  });

  invalidateCache();
  return row;
}

async function deleteShippingSetting(id, req) {
  const row = await db.ShippingSetting.findByPk(id);
  if (!row) throw AppError.notFound('Configuração de frete não encontrada.', 'SHIPPING_NOT_FOUND');

  const oldValue = row.toJSON();
  await row.destroy();

  await logChange('shipping_setting', {
    entity_id: id,
    action: 'delete',
    old_value: oldValue,
    new_value: null,
    req,
  });

  invalidateCache();
}

/* ------------------------------------------------------------------------- */
/* 6) payment_gateway_settings                                                */
/* ------------------------------------------------------------------------- */

const GATEWAY_PROVIDERS = ['mercado_pago'];
const GATEWAY_ENVIRONMENTS = ['test', 'production'];

/** Serializa um gateway mascarando segredos (nunca retorna ciphertext). */
function maskGateway(row) {
  return {
    id: row.id,
    provider: row.provider,
    environment: row.environment,
    label: row.label,
    is_active: row.is_active,
    public_key: row.public_key,
    client_id: row.client_id,
    hasAccessToken: Boolean(row.access_token_encrypted),
    hasClientSecret: Boolean(row.client_secret_encrypted),
    hasWebhookSecret: Boolean(row.webhook_secret_encrypted),
    hasExtra: Boolean(row.extra_encrypted),
    key_version: row.key_version,
    rotated_at: row.rotated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listGateways() {
  const rows = await db.PaymentGatewaySetting.findAll({ order: [['provider', 'ASC'], ['environment', 'ASC']] });
  return rows.map(maskGateway);
}

function buildGatewaySecretFields(data) {
  // Retorna { fields, rotated } onde fields contém apenas colunas *_encrypted
  // quando um segredo foi fornecido. rotated indica se houve rotação de segredo.
  const fields = {};
  let rotated = false;

  if (data.access_token !== undefined) {
    fields.access_token_encrypted = data.access_token ? crypto.encrypt(data.access_token) : null;
    rotated = true;
  }
  if (data.client_secret !== undefined) {
    fields.client_secret_encrypted = data.client_secret ? crypto.encrypt(data.client_secret) : null;
    rotated = true;
  }
  if (data.webhook_secret !== undefined) {
    fields.webhook_secret_encrypted = data.webhook_secret ? crypto.encrypt(data.webhook_secret) : null;
    rotated = true;
  }
  if (data.extra !== undefined) {
    fields.extra_encrypted = data.extra ? crypto.encryptJson(data.extra) : null;
    rotated = true;
  }

  return { fields, rotated };
}

function validateGatewayBase(data, { partial = false } = {}) {
  const out = {};
  if (!partial || data.provider !== undefined) {
    const provider = data.provider || 'mercado_pago';
    if (!GATEWAY_PROVIDERS.includes(provider)) {
      throw AppError.unprocessable('provider inválido.', 'INVALID_ENUM', { field: 'provider', allowed: GATEWAY_PROVIDERS });
    }
    out.provider = provider;
  }
  if (!partial || data.environment !== undefined) {
    const env = data.environment || 'test';
    if (!GATEWAY_ENVIRONMENTS.includes(env)) {
      throw AppError.unprocessable('environment inválido.', 'INVALID_ENUM', { field: 'environment', allowed: GATEWAY_ENVIRONMENTS });
    }
    out.environment = env;
  }
  if (data.label !== undefined) out.label = data.label || null;
  if (data.public_key !== undefined) out.public_key = data.public_key || null;
  if (data.client_id !== undefined) out.client_id = data.client_id || null;
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);
  return out;
}

async function createGateway(data, req) {
  const base = validateGatewayBase(data, { partial: false });
  const { fields, rotated } = buildGatewaySecretFields(data);

  const payload = {
    ...base,
    ...fields,
    is_encrypted: true,
    key_version: 1,
    rotated_at: rotated ? new Date() : null,
    updated_by: actorId(req),
  };

  const existing = await db.PaymentGatewaySetting.findOne({
    where: { provider: payload.provider, environment: payload.environment },
  });
  if (existing) {
    throw AppError.conflict('Já existe gateway para este provider/environment.', 'GATEWAY_EXISTS');
  }

  const row = await db.PaymentGatewaySetting.create(payload);

  await logChange('payment_gateway', {
    entity_id: row.id,
    action: 'create',
    old_value: null,
    new_value: { ...maskGateway(row), secrets: ENCRYPTED_PLACEHOLDER },
    req,
  });

  invalidateCache();
  return maskGateway(row);
}

async function updateGateway(id, data, req) {
  const row = await db.PaymentGatewaySetting.findByPk(id);
  if (!row) throw AppError.notFound('Gateway não encontrado.', 'GATEWAY_NOT_FOUND');

  const base = validateGatewayBase(data, { partial: true });
  const { fields, rotated } = buildGatewaySecretFields(data);

  const payload = { ...base, ...fields, updated_by: actorId(req) };
  if (rotated) {
    payload.rotated_at = new Date();
    payload.key_version = (row.key_version || 1) + 1;
    payload.is_encrypted = true;
  }

  const oldValue = { ...maskGateway(row), secrets: ENCRYPTED_PLACEHOLDER };
  await row.update(payload);

  await logChange('payment_gateway', {
    entity_id: row.id,
    action: 'update',
    old_value: oldValue,
    new_value: { ...maskGateway(row), secrets: ENCRYPTED_PLACEHOLDER },
    req,
  });

  invalidateCache();
  return maskGateway(row);
}

async function activateGateway(id, req) {
  const row = await db.PaymentGatewaySetting.findByPk(id);
  if (!row) throw AppError.notFound('Gateway não encontrado.', 'GATEWAY_NOT_FOUND');

  await db.sequelize.transaction(async (transaction) => {
    await db.PaymentGatewaySetting.update(
      { is_active: false, updated_by: actorId(req) },
      { where: { provider: row.provider, id: { [Op.ne]: row.id } }, transaction }
    );
    await row.update({ is_active: true, updated_by: actorId(req) }, { transaction });

    await logChange(
      'payment_gateway',
      {
        entity_id: row.id,
        action: 'update',
        old_value: { is_active: false },
        new_value: { is_active: true, activated: true },
        req,
      },
      { transaction }
    );
  });

  invalidateCache();
  return maskGateway(await db.PaymentGatewaySetting.findByPk(id));
}

/* ------------------------------------------------------------------------- */
/* 7) integration_settings                                                    */
/* ------------------------------------------------------------------------- */

const INTEGRATION_SERVICES = ['brevo', 'zoho', 'firebase', 'melhor_envio', 'fcm', 'onesignal'];
const INTEGRATION_ENVIRONMENTS = ['test', 'production'];

/** Serializa uma integração mascarando as credenciais cifradas. */
function maskIntegration(row) {
  return {
    id: row.id,
    service: row.service,
    environment: row.environment,
    label: row.label,
    is_active: row.is_active,
    config: row.config || {},
    hasCredentials: Boolean(row.credentials_encrypted),
    key_version: row.key_version,
    rotated_at: row.rotated_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listIntegrations() {
  const rows = await db.IntegrationSetting.findAll({ order: [['service', 'ASC'], ['environment', 'ASC']] });
  return rows.map(maskIntegration);
}

function validateIntegrationBase(data, { partial = false } = {}) {
  const out = {};
  if (!partial || data.service !== undefined) {
    if (!data.service || !INTEGRATION_SERVICES.includes(data.service)) {
      throw AppError.unprocessable('service inválido.', 'INVALID_ENUM', { field: 'service', allowed: INTEGRATION_SERVICES });
    }
    out.service = data.service;
  }
  if (!partial || data.environment !== undefined) {
    const env = data.environment || 'production';
    if (!INTEGRATION_ENVIRONMENTS.includes(env)) {
      throw AppError.unprocessable('environment inválido.', 'INVALID_ENUM', { field: 'environment', allowed: INTEGRATION_ENVIRONMENTS });
    }
    out.environment = env;
  }
  if (data.label !== undefined) out.label = data.label || null;
  if (data.config !== undefined) out.config = data.config || null;
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);
  return out;
}

async function createIntegration(data, req) {
  const base = validateIntegrationBase(data, { partial: false });
  let rotated = false;
  if (data.credentials !== undefined) {
    base.credentials_encrypted = data.credentials ? crypto.encryptJson(data.credentials) : null;
    rotated = true;
  }

  const payload = {
    ...base,
    is_encrypted: true,
    key_version: 1,
    rotated_at: rotated ? new Date() : null,
    updated_by: actorId(req),
  };

  const existing = await db.IntegrationSetting.findOne({
    where: { service: payload.service, environment: payload.environment },
  });
  if (existing) {
    throw AppError.conflict('Já existe integração para este service/environment.', 'INTEGRATION_EXISTS');
  }

  const row = await db.IntegrationSetting.create(payload);

  await logChange('payment_gateway', {
    entity_id: row.id,
    setting_key: `integration:${row.service}`,
    action: 'create',
    old_value: null,
    new_value: { ...maskIntegration(row), credentials: ENCRYPTED_PLACEHOLDER },
    req,
  });

  invalidateCache();
  return maskIntegration(row);
}

async function updateIntegration(id, data, req) {
  const row = await db.IntegrationSetting.findByPk(id);
  if (!row) throw AppError.notFound('Integração não encontrada.', 'INTEGRATION_NOT_FOUND');

  const base = validateIntegrationBase(data, { partial: true });
  let rotated = false;
  if (data.credentials !== undefined) {
    base.credentials_encrypted = data.credentials ? crypto.encryptJson(data.credentials) : null;
    rotated = true;
  }

  const payload = { ...base, updated_by: actorId(req) };
  if (rotated) {
    payload.rotated_at = new Date();
    payload.key_version = (row.key_version || 1) + 1;
    payload.is_encrypted = true;
  }

  const oldValue = { ...maskIntegration(row), credentials: ENCRYPTED_PLACEHOLDER };
  await row.update(payload);

  await logChange('payment_gateway', {
    entity_id: row.id,
    setting_key: `integration:${row.service}`,
    action: 'update',
    old_value: oldValue,
    new_value: { ...maskIntegration(row), credentials: ENCRYPTED_PLACEHOLDER },
    req,
  });

  invalidateCache();
  return maskIntegration(row);
}

async function activateIntegration(id, req) {
  const row = await db.IntegrationSetting.findByPk(id);
  if (!row) throw AppError.notFound('Integração não encontrada.', 'INTEGRATION_NOT_FOUND');

  await db.sequelize.transaction(async (transaction) => {
    await db.IntegrationSetting.update(
      { is_active: false, updated_by: actorId(req) },
      { where: { service: row.service, id: { [Op.ne]: row.id } }, transaction }
    );
    await row.update({ is_active: true, updated_by: actorId(req) }, { transaction });

    await logChange(
      'payment_gateway',
      {
        entity_id: row.id,
        setting_key: `integration:${row.service}`,
        action: 'update',
        old_value: { is_active: false },
        new_value: { is_active: true, activated: true },
        req,
      },
      { transaction }
    );
  });

  invalidateCache();
  return maskIntegration(await db.IntegrationSetting.findByPk(id));
}

/* ------------------------------------------------------------------------- */
/* 8) blocked_words                                                           */
/* ------------------------------------------------------------------------- */

const WORD_SEVERITIES = ['low', 'medium', 'high'];
const WORD_ACTIONS = ['flag', 'block', 'mask'];
const WORD_SCOPES = ['all', 'chat', 'product', 'review'];

function validateBlockedWordPayload(data, { partial = false } = {}) {
  const out = {};

  if (!partial || data.word !== undefined) {
    if (!data.word || String(data.word).trim() === '') {
      throw AppError.unprocessable('Campo "word" é obrigatório.', 'VALUE_REQUIRED', { field: 'word' });
    }
    out.word = String(data.word).trim();
  }

  if (data.severity !== undefined) {
    if (!WORD_SEVERITIES.includes(data.severity)) {
      throw AppError.unprocessable('severity inválida.', 'INVALID_ENUM', { field: 'severity', allowed: WORD_SEVERITIES });
    }
    out.severity = data.severity;
  }
  if (data.action !== undefined) {
    if (!WORD_ACTIONS.includes(data.action)) {
      throw AppError.unprocessable('action inválida.', 'INVALID_ENUM', { field: 'action', allowed: WORD_ACTIONS });
    }
    out.action = data.action;
  }
  if (data.scope !== undefined) {
    if (!WORD_SCOPES.includes(data.scope)) {
      throw AppError.unprocessable('scope inválido.', 'INVALID_ENUM', { field: 'scope', allowed: WORD_SCOPES });
    }
    out.scope = data.scope;
  }
  if (data.is_regex !== undefined) {
    out.is_regex = Boolean(data.is_regex);
    if (out.is_regex && out.word) {
      try {
        // eslint-disable-next-line no-new
        new RegExp(out.word);
      } catch (e) {
        throw AppError.unprocessable('Expressão regular inválida.', 'INVALID_REGEX', { field: 'word' });
      }
    }
  }
  if (data.is_active !== undefined) out.is_active = Boolean(data.is_active);

  return out;
}

async function listBlockedWords() {
  return db.BlockedWord.findAll({ order: [['created_at', 'DESC']] });
}

async function createBlockedWord(data, req) {
  const payload = validateBlockedWordPayload(data, { partial: false });
  payload.created_by = actorId(req);

  const existing = await db.BlockedWord.findOne({ where: { word: payload.word } });
  if (existing) throw AppError.conflict('Palavra já cadastrada.', 'BLOCKED_WORD_EXISTS');

  const row = await db.BlockedWord.create(payload);
  moderationService.invalidate();
  invalidateCache();
  return row;
}

async function updateBlockedWord(id, data, req) {
  const row = await db.BlockedWord.findByPk(id);
  if (!row) throw AppError.notFound('Palavra bloqueada não encontrada.', 'BLOCKED_WORD_NOT_FOUND');

  const payload = validateBlockedWordPayload(data, { partial: true });
  await row.update(payload);

  moderationService.invalidate();
  invalidateCache();
  return row;
}

async function deleteBlockedWord(id) {
  const row = await db.BlockedWord.findByPk(id);
  if (!row) throw AppError.notFound('Palavra bloqueada não encontrada.', 'BLOCKED_WORD_NOT_FOUND');

  await row.destroy();
  moderationService.invalidate();
  invalidateCache();
}

/* ------------------------------------------------------------------------- */
/* 9) setting_change_logs                                                     */
/* ------------------------------------------------------------------------- */

async function listSettingLogs({ page = 1, limit = 20, entity = null } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(100, Math.max(1, Number(limit) || 20));
  const where = {};
  if (entity) where.entity = entity;

  const { rows, count } = await db.SettingChangeLog.findAndCountAll({
    where,
    order: [['created_at', 'DESC']],
    limit: limitNum,
    offset: (pageNum - 1) * limitNum,
  });

  return { rows, page: pageNum, limit: limitNum, total: count };
}

module.exports = {
  logChange,
  // platform_settings
  listSettings,
  getSetting,
  updateSetting,
  restoreSetting,
  // commission_rules
  listCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  // highlight_packages
  listHighlightPackages,
  createHighlightPackage,
  updateHighlightPackage,
  deleteHighlightPackage,
  // category_pricing
  listCategoryPricing,
  createCategoryPricing,
  updateCategoryPricing,
  deleteCategoryPricing,
  // shipping_settings
  listShippingSettings,
  createShippingSetting,
  updateShippingSetting,
  deleteShippingSetting,
  // payment_gateway_settings
  listGateways,
  createGateway,
  updateGateway,
  activateGateway,
  // integration_settings
  listIntegrations,
  createIntegration,
  updateIntegration,
  activateIntegration,
  // blocked_words
  listBlockedWords,
  createBlockedWord,
  updateBlockedWord,
  deleteBlockedWord,
  // logs
  listSettingLogs,
};
