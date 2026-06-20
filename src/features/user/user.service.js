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
const receitaws = require('../../providers/receitaws/receitaws.provider');

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

/**
 * Aplica um banimento.
 * - scope 'full': banimento total → account_status='banned' (middleware HTTP bloqueia tudo).
 * - scopes parciais ('selling'/'buying'/'chat'): NÃO seta account_status='banned'
 *   (senão bloquearia tudo); apenas cria o UserBan ativo e a enforce é feita por
 *   serviço (chat/product) via getActiveBanScopes.
 * - shadowban (type 'shadow' ou shadow:true): não bane — marca users.is_shadowbanned=true.
 */
async function ban(
  userId,
  { reason, type = 'temporary', scope = 'full', expires_at, shadow = false } = {},
  bannedBy
) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const isShadow = shadow === true || type === 'shadow';

  const result = await db.sequelize.transaction(async (transaction) => {
    const record = await db.UserBan.create(
      {
        user_id: userId,
        banned_by: bannedBy || null,
        // O ENUM do UserBan só conhece 'temporary'/'permanent'; um shadowban é
        // persistido como banimento temporário com o sinal em users.is_shadowbanned.
        type: isShadow ? 'temporary' : type,
        scope,
        reason: reason || null,
        starts_at: new Date(),
        expires_at: expires_at || null,
        is_active: true,
      },
      { transaction }
    );

    if (isShadow) {
      // Shadowban: usuário não percebe — não altera account_status.
      await setShadowbanned(userId, true, transaction);
    } else if (scope === 'full') {
      user.account_status = 'banned';
      await user.save({ transaction });
    }
    // Escopos parciais não tocam account_status (enforce por serviço).

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
    await setShadowbanned(userId, false, transaction);
    user.account_status = 'active';
    await user.save({ transaction });
  });

  return sanitize(user);
}

/* ----------------------------- Ban scopes / shadow ------------------------ */

/**
 * Retorna os escopos de banimento ATIVOS de um usuário (is_active e não expirados).
 * @returns {Promise<string[]>} ex.: ['chat', 'selling']
 */
async function getActiveBanScopes(userId) {
  const now = new Date();
  const bans = await db.UserBan.findAll({
    where: {
      user_id: userId,
      is_active: true,
      [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }],
    },
    attributes: ['scope'],
  });
  return [...new Set(bans.map((b) => b.scope))];
}

/**
 * Lê o flag users.is_shadowbanned via SQL cru (a coluna existe por migration,
 * mas não é declarada no model User — evita depender da edição do model).
 */
async function isShadowbanned(userId) {
  const [rows] = await db.sequelize.query(
    'SELECT is_shadowbanned FROM users WHERE id = :id LIMIT 1',
    { replacements: { id: userId } }
  );
  return !!(rows && rows[0] && rows[0].is_shadowbanned);
}

/** Define users.is_shadowbanned via SQL cru (coluna não declarada no model). */
async function setShadowbanned(userId, value, transaction) {
  await db.sequelize.query(
    'UPDATE users SET is_shadowbanned = :value, updated_at = NOW() WHERE id = :id',
    { replacements: { id: userId, value: !!value }, transaction }
  );
}

/* --------------------- Validação de documento (ReceitaWS) ----------------- */

/**
 * Valida o documento do vendedor.
 * - person_type 'company' (tem CNPJ): consulta a ReceitaWS. Se a consulta funcionar
 *   e situação !== 'ATIVA', lança CNPJ_INACTIVE. Se ATIVA, registra o resultado em
 *   metadata.document_validation. Falha de rede/rate-limit não invalida o cadastro.
 * - person_type 'individual' (CPF): a ReceitaWS gratuita NÃO cobre CPF, então
 *   fazemos apenas validação sintática (dígitos verificadores) local.
 *
 * Complementar à verificação facial (KYC) existente — não a substitui.
 */
async function validateSellerDocument(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  if (user.person_type === 'company') {
    if (!user.cnpj) {
      throw AppError.unprocessable('Usuário PJ sem CNPJ cadastrado.', 'CNPJ_MISSING');
    }
    if (!validators.isCNPJ(user.cnpj)) {
      throw AppError.unprocessable('CNPJ inválido.', 'CNPJ_INVALID');
    }

    const lookup = await receitaws.lookupCnpj(user.cnpj);
    if (!lookup.ok) {
      // ReceitaWS indisponível/rate-limit: não invalida o cadastro, só informa.
      return {
        document: 'cnpj',
        validated: false,
        skipped: true,
        reason: lookup.error,
      };
    }
    if (lookup.situacao !== 'ATIVA') {
      throw AppError.unprocessable('CNPJ não está ativo na Receita.', 'CNPJ_INACTIVE');
    }

    const metadata = { ...(user.metadata || {}) };
    metadata.document_validation = {
      document: 'cnpj',
      situacao: lookup.situacao,
      nome: lookup.nome || null,
      validated_at: new Date().toISOString(),
    };
    await user.update({ metadata });

    return { document: 'cnpj', validated: true, situacao: lookup.situacao, nome: lookup.nome || null };
  }

  // person_type 'individual' → CPF (somente validação sintática local).
  if (!user.cpf) {
    throw AppError.unprocessable('Usuário PF sem CPF cadastrado.', 'CPF_MISSING');
  }
  if (!validators.isCPF(user.cpf)) {
    throw AppError.unprocessable('CPF inválido.', 'CPF_INVALID');
  }
  return { document: 'cpf', validated: true, note: 'CPF validado sintaticamente (Receita não cobre CPF).' };
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
  getActiveBanScopes,
  isShadowbanned,
  validateSellerDocument,
  submitVerification,
  reviewVerification,
  myVerifications,
  sanitize,
};
