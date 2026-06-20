'use strict';

/** Serviço de Perguntas & Respostas de produtos. */
const db = require('../../models');
const AppError = require('../../utils/AppError');

const askerInclude = { model: db.User, as: 'asker', attributes: ['id', 'name'] };

/** Perguntas visíveis de um produto (respondidas + aguardando). */
async function listByProduct(productId) {
  const rows = await db.ProductQuestion.findAll({
    where: { product_id: productId, status: ['pending', 'answered'] },
    include: [askerInclude],
    order: [['created_at', 'DESC']],
  });
  const total = rows.length;
  const answered = rows.filter((r) => r.status === 'answered').length;
  return { questions: rows, total, answered };
}

async function ask(userId, productId, question) {
  if (!question || question.trim().length < 10) {
    throw AppError.unprocessable('A pergunta deve ter pelo menos 10 caracteres.', 'QUESTION_TOO_SHORT');
  }
  const product = await db.Product.findByPk(productId);
  if (!product) throw AppError.notFound('Produto não encontrado.', 'PRODUCT_NOT_FOUND');
  return db.ProductQuestion.create({ product_id: productId, user_id: userId, question: question.trim(), status: 'pending' });
}

/** Responder (somente o vendedor dono do produto). */
async function answer(questionId, sellerId, answerText) {
  if (!answerText || !answerText.trim()) {
    throw AppError.unprocessable('Resposta vazia.', 'ANSWER_EMPTY');
  }
  const q = await db.ProductQuestion.findByPk(questionId, {
    include: [{ model: db.Product, as: 'product', attributes: ['id', 'seller_id'] }],
  });
  if (!q) throw AppError.notFound('Pergunta não encontrada.', 'QUESTION_NOT_FOUND');
  if (!q.product || q.product.seller_id !== sellerId) {
    throw AppError.forbidden('Apenas o vendedor do produto pode responder.', 'NOT_PRODUCT_SELLER');
  }
  q.answer = answerText.trim();
  q.answered_at = new Date();
  q.answered_by = sellerId;
  q.status = 'answered';
  await q.save();
  return q;
}

module.exports = { listByProduct, ask, answer };
