'use strict';

/** Cupons de desconto: listagem pública, validação e CRUD admin. */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');

const PUBLIC_ATTRS = ['id', 'code', 'description', 'type', 'value', 'max_discount_amount', 'min_order_amount', 'expires_at'];
const FIELDS = [
  'code', 'description', 'type', 'value', 'max_discount_amount', 'min_order_amount',
  'scope', 'category_id', 'seller_id', 'product_id', 'usage_limit', 'usage_limit_per_user',
  'starts_at', 'expires_at', 'is_active',
];

function activeWhere() {
  const now = new Date();
  return {
    is_active: true,
    [Op.and]: [
      { [Op.or]: [{ starts_at: null }, { starts_at: { [Op.lte]: now } }] },
      { [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gte]: now } }] },
    ],
  };
}

/** Cupons públicos ativos (vitrine /cupons). */
async function listActive() {
  return db.Coupon.findAll({ where: activeWhere(), attributes: PUBLIC_ATTRS, order: [['created_at', 'DESC']] });
}

/** Calcula o desconto de um cupom sobre um subtotal. */
function computeDiscount(coupon, subtotal) {
  let discount = coupon.type === 'percentage' ? (Number(subtotal) * Number(coupon.value)) / 100 : Number(coupon.value);
  if (coupon.max_discount_amount != null) discount = Math.min(discount, Number(coupon.max_discount_amount));
  return Math.max(0, Math.round(discount * 100) / 100);
}

/** Valida um código de cupom para um usuário/subtotal. Retorna { coupon, discount }. */
async function validate(userId, code, subtotal = 0) {
  if (!code) throw AppError.unprocessable('Informe o código do cupom.', 'COUPON_CODE_REQUIRED');
  const coupon = await db.Coupon.findOne({ where: { code: String(code).toUpperCase().trim() } });
  if (!coupon || !coupon.is_active) throw AppError.unprocessable('Cupom inválido.', 'COUPON_INVALID');

  const now = new Date();
  if (coupon.starts_at && new Date(coupon.starts_at) > now) throw AppError.unprocessable('Cupom ainda não está válido.', 'COUPON_NOT_STARTED');
  if (coupon.expires_at && new Date(coupon.expires_at) < now) throw AppError.unprocessable('Cupom expirado.', 'COUPON_EXPIRED');
  if (coupon.min_order_amount != null && Number(subtotal) < Number(coupon.min_order_amount)) {
    throw AppError.unprocessable(`Pedido mínimo de R$ ${Number(coupon.min_order_amount).toFixed(2)} para este cupom.`, 'COUPON_MIN_ORDER');
  }
  if (coupon.usage_limit != null && coupon.used_count >= coupon.usage_limit) {
    throw AppError.unprocessable('Cupom esgotado.', 'COUPON_EXHAUSTED');
  }
  if (coupon.usage_limit_per_user != null && userId) {
    const used = await db.CouponRedemption.count({ where: { coupon_id: coupon.id, user_id: userId } });
    if (used >= coupon.usage_limit_per_user) throw AppError.unprocessable('Você já utilizou este cupom.', 'COUPON_USER_LIMIT');
  }

  return { coupon, discount: computeDiscount(coupon, subtotal) };
}

/* ===== Admin ===== */
async function listAll() {
  return db.Coupon.findAll({ order: [['created_at', 'DESC']] });
}

async function create(data = {}, userId) {
  if (!data.code) throw AppError.unprocessable('code é obrigatório.', 'COUPON_CODE_REQUIRED');
  const payload = { created_by: userId || null };
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) payload[f] = data[f];
  });
  payload.code = String(payload.code).toUpperCase().trim();
  return db.Coupon.create(payload);
}

async function update(id, data = {}) {
  const coupon = await db.Coupon.findByPk(id);
  if (!coupon) throw AppError.notFound('Cupom não encontrado.', 'COUPON_NOT_FOUND');
  const updates = {};
  FIELDS.forEach((f) => {
    if (Object.prototype.hasOwnProperty.call(data, f)) updates[f] = data[f];
  });
  if (updates.code) updates.code = String(updates.code).toUpperCase().trim();
  await coupon.update(updates);
  return coupon;
}

async function remove(id) {
  const coupon = await db.Coupon.findByPk(id);
  if (!coupon) throw AppError.notFound('Cupom não encontrado.', 'COUPON_NOT_FOUND');
  await coupon.destroy();
}

module.exports = { listActive, validate, listAll, create, update, remove, computeDiscount };
