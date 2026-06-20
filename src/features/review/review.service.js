'use strict';

/** Serviço de Avaliações (reviews) de produtos. */
const db = require('../../models');
const AppError = require('../../utils/AppError');

const userInclude = { model: db.User, as: 'user', attributes: ['id', 'name'] };

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

module.exports = { listByProduct, listMine, create };
