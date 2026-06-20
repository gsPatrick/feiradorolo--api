'use strict';

/** Serviço de Favoritos (lista de desejos do usuário). */
const db = require('../../models');

function productInclude() {
  return {
    model: db.Product,
    as: 'product',
    include: [
      { model: db.User, as: 'seller', attributes: ['id', 'name', 'email'] },
      { model: db.Category, as: 'category', attributes: ['id', 'name', 'slug'] },
    ],
  };
}

/** Produtos favoritados pelo usuário. */
async function listMine(userId) {
  const rows = await db.Favorite.findAll({
    where: { user_id: userId },
    include: [productInclude()],
    order: [['created_at', 'DESC']],
  });
  return rows.map((r) => r.product).filter(Boolean);
}

/** IDs dos produtos favoritados (para marcar o coração). */
async function idsMine(userId) {
  const rows = await db.Favorite.findAll({ where: { user_id: userId }, attributes: ['product_id'] });
  return rows.map((r) => r.product_id);
}

async function add(userId, productId) {
  const [fav] = await db.Favorite.findOrCreate({ where: { user_id: userId, product_id: productId } });
  return fav;
}

async function remove(userId, productId) {
  await db.Favorite.destroy({ where: { user_id: userId, product_id: productId } });
}

module.exports = { listMine, idsMine, add, remove };
