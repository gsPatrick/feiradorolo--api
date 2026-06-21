'use strict';

/** Serviço de Avaliações (reviews) de produtos. */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');

const userInclude = { model: db.User, as: 'user', attributes: ['id', 'name'] };

/** Verdadeiro se o usuário comprou o produto (pedido pago/enviado/entregue/concluído). */
async function hasPurchased(userId, productId) {
  const order = await db.Order.findOne({
    where: { buyer_id: userId, status: { [Op.in]: ['paid', 'shipped', 'delivered', 'completed'] } },
    include: [{ model: db.OrderItem, as: 'items', where: { product_id: productId }, required: true }],
  });
  return !!order;
}

/** Pode avaliar? (comprou e ainda não avaliou). */
async function canReview(userId, productId) {
  if (!userId || !productId) return false;
  if (!(await hasPurchased(userId, productId))) return false;
  const existing = await db.Review.findOne({ where: { user_id: userId, product_id: productId } });
  return !existing;
}

/** Avaliações aprovadas de um produto + média e total. */
async function listByProduct(productId) {
  const reviews = await db.Review.findAll({
    where: { product_id: productId, status: 'approved' },
    include: [userInclude],
    order: [['created_at', 'DESC']],
  });
  const count = reviews.length;
  const average = count ? reviews.reduce((s, r) => s + r.rating, 0) / count : 0;
  return { reviews, count, average: Math.round(average * 10) / 10 };
}

/** Avaliações feitas pelo usuário (com o produto avaliado). */
async function listMine(userId) {
  return db.Review.findAll({
    where: { user_id: userId },
    include: [
      { model: db.Product, as: 'product', attributes: ['id', 'title', 'slug', 'images'] },
    ],
    order: [['created_at', 'DESC']],
  });
}

async function create(userId, data = {}) {
  if (!data.product_id) throw AppError.unprocessable('product_id é obrigatório.', 'REVIEW_PRODUCT_REQUIRED');
  const rating = Number(data.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw AppError.unprocessable('rating deve ser de 1 a 5.', 'REVIEW_INVALID_RATING');
  }
  const product = await db.Product.findByPk(data.product_id);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');

  // Só quem comprou pode avaliar.
  if (!(await hasPurchased(userId, data.product_id))) {
    throw AppError.forbidden('Você só pode avaliar produtos que comprou.', 'REVIEW_NOT_PURCHASED');
  }

  return db.Review.create({
    product_id: data.product_id,
    user_id: userId,
    order_id: data.order_id || null,
    rating,
    title: data.title || null,
    comment: data.comment || null,
    images: Array.isArray(data.images) ? data.images : null,
    status: 'approved',
  });
}

module.exports = { listByProduct, listMine, create, canReview };
