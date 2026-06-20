'use strict';

/**
 * Serviço de usuários: listagem/busca, perfil, RBAC (atribuir/remover papéis),
 * banimentos e verificação facial (KYC) para vendedor e comprador.
 */
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const validators = require('../../utils/validators');
const permissionService = require('../../services/permission.service');

const PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'cpf',
  'cnpj',
  'birth_date',
  'avatar_url',
  'zip_code',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'latitude',
  'longitude',
];

const VERIFICATION_CONTEXTS = ['seller', 'buyer'];

/** Remove campos sensíveis do usuário antes de devolver ao cliente. */
function sanitize(user) {
  if (!user) return user;
  const data = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete data.password_hash;
  return data;
}

async function list({ page = 1, limit = 20, search, status } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const offset = (pageNum - 1) * limitNum;

  const where = {};
  if (status) where.account_status = status;

  if (search) {
    const term = String(search).trim();
    const digits = validators.onlyDigits(term);
    const or = [
      { name: { [Op.iLike]: `%${term}%` } },
      { email: { [Op.iLike]: `%${term}%` } },
    ];
    if (digits) {
      or.push({ cpf: digits });
      or.push({ cnpj: digits });
    }
    where[Op.or] = or;
  }

  const { rows, count } = await db.User.findAndCountAll({
    where,
    limit: limitNum,
    offset,
    order: [['created_at', 'DESC']],
  });

  return { rows: rows.map(sanitize), total: count };
}

async function getById(id) {
  const user = await db.User.findByPk(id);
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  return sanitize(user);
}

async function updateProfile(userId, data = {}) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const updates = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updates[field] = data[field];
    }
  }
  await user.update(updates);
  return sanitize(user);
}

async function assignRole(userId, roleSlug, assignedBy) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const role = await db.Role.findOne({ where: { slug: roleSlug } });
  if (!role) throw AppError.notFound('Papel não encontrado.');

  const [userRole] = await db.UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { user_id: userId, role_id: role.id, assigned_by: assignedBy || null },
  });
  if (assignedBy && userRole.assigned_by !== assignedBy) {
    userRole.assigned_by = assignedBy;
    await userRole.save();
  }

  permissionService.invalidate(userId);
  return userRole;
}

async function removeRole(userId, roleSlug) {
  const role = await db.Role.findOne({ where: { slug: roleSlug } });
  if (!role) throw AppError.notFound('Papel não encontrado.');

  const removed = await db.UserRole.destroy({ where: { user_id: userId, role_id: role.id } });
  permissionService.invalidate(userId);
  return removed > 0;
}

async function ban(userId, { reason, type = 'temporary', scope = 'full', expires_at } = {}, bannedBy) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const result = await db.sequelize.transaction(async (transaction) => {
    const record = await db.UserBan.create(
      {
        user_id: userId,
        banned_by: bannedBy || null,
        type,
        scope,
        reason: reason || null,
        starts_at: new Date(),
        expires_at: expires_at || null,
        is_active: true,
      },
      { transaction }
    );
    user.account_status = 'banned';
    await user.save({ transaction });
    return record;
  });

  return result;
}

async function unban(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  await db.sequelize.transaction(async (transaction) => {
    await db.UserBan.update(
      { is_active: false, lifted_at: new Date() },
      { where: { user_id: userId, is_active: true }, transaction }
    );
    user.account_status = 'active';
    await user.save({ transaction });
  });

  return sanitize(user);
}

/* ------------------------------- KYC / facial ----------------------------- */

async function submitVerification(userId, { context, selfie_url, document_url } = {}) {
  if (!VERIFICATION_CONTEXTS.includes(context)) {
    throw AppError.unprocessable("context deve ser 'seller' ou 'buyer'.", 'INVALID_CONTEXT');
  }
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const record = await db.sequelize.transaction(async (transaction) => {
    const created = await db.FacialVerification.create(
      {
        user_id: userId,
        context,
        status: 'pending',
        selfie_url: selfie_url || null,
        document_url: document_url || null,
      },
      { transaction }
    );
    user[`${context}_verification_status`] = 'pending';
    await user.save({ transaction });
    return created;
  });

  return record;
}

async function reviewVerification(verificationId, { status, rejection_reason } = {}, reviewerId) {
  if (!['approved', 'rejected'].includes(status)) {
    throw AppError.unprocessable("status deve ser 'approved' ou 'rejected'.", 'INVALID_STATUS');
  }
  const record = await db.FacialVerification.findByPk(verificationId);
  if (!record) throw AppError.notFound('Verificação não encontrada.');

  const result = await db.sequelize.transaction(async (transaction) => {
    record.status = status;
    record.rejection_reason = status === 'rejected' ? rejection_reason || null : null;
    record.reviewed_by = reviewerId || null;
    record.reviewed_at = new Date();
    await record.save({ transaction });

    const user = await db.User.findByPk(record.user_id, { transaction });
    if (user) {
      user[`${record.context}_verification_status`] = status === 'approved' ? 'verified' : 'rejected';
      await user.save({ transaction });
    }
    return record;
  });

  // KYC: comprador aprovado → libera os pedidos que estavam retidos e avisa os vendedores.
  if (status === 'approved' && result.context === 'buyer') {
    const held = await db.Order.findAll({
      where: { buyer_id: result.user_id, held_for_buyer_verification: true },
    });
    if (held.length) {
      const notify = require('../notification/notification.service');
      for (const order of held) {
        await order.update({ held_for_buyer_verification: false });
        notify
          .notifyUser(order.seller_id, {
            type: 'order.released',
            channel: 'in_app',
            title: 'Pedido liberado',
            body: `O comprador concluiu a verificação facial. O pedido ${order.order_number} foi liberado para envio.`,
          })
          .catch(() => {});
      }
    }
  }

  return result;
}

async function myVerifications(userId) {
  return db.FacialVerification.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });
}

module.exports = {
  list,
  getById,
  updateProfile,
  assignRole,
  removeRole,
  ban,
  unban,
  submitVerification,
  reviewVerification,
  myVerifications,
  sanitize,
};
