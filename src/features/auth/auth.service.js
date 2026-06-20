'use strict';

/**
 * Serviço de autenticação: cadastro local, login local, login social (Firebase),
 * logout (revogação via token_blacklist) e perfil corrente (me).
 */
const db = require('../../models');
const AppError = require('../../utils/AppError');
const jwtUtil = require('../../utils/jwt');
const passwordUtil = require('../../utils/password');
const validators = require('../../utils/validators');
const firebaseProvider = require('../../providers/firebase/firebase.provider');
const permissionService = require('../../services/permission.service');
const settings = require('../../services/settings.cache');

const DEFAULT_ROLE_SLUG = 'user';

/** Remove campos sensíveis do usuário antes de devolver ao cliente. */
function sanitize(user) {
  if (!user) return user;
  const data = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete data.password_hash;
  return data;
}

/** Assina um JWT (validade dinâmica de auth.jwt_expires_in) e devolve o token. */
async function issueToken(user) {
  const expiresIn = await settings.get('auth.jwt_expires_in', null);
  const { token } = jwtUtil.sign({ sub: user.id }, expiresIn ? { expiresIn } : {});
  return token;
}

/** Garante o papel padrão ('user') para um usuário recém-criado. */
async function assignDefaultRole(userId, transaction) {
  const role = await db.Role.findOne({ where: { slug: DEFAULT_ROLE_SLUG }, transaction });
  if (!role) return;
  await db.UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { user_id: userId, role_id: role.id },
    transaction,
  });
  permissionService.invalidate(userId);
}

async function register({ name, email, password, phone, person_type, cpf, cnpj, legal_name }) {
  if (!name || !email || !password) {
    throw AppError.unprocessable('Nome, e-mail e senha são obrigatórios.');
  }
  if (!validators.isEmail(email)) {
    throw AppError.unprocessable('E-mail inválido.', 'INVALID_EMAIL');
  }

  const type = person_type || 'individual';
  let cleanCpf = null;
  let cleanCnpj = null;

  if (type === 'individual') {
    if (!cpf || !validators.isCPF(cpf)) {
      throw AppError.unprocessable('CPF inválido.', 'INVALID_CPF');
    }
    cleanCpf = validators.onlyDigits(cpf);
  } else if (type === 'company') {
    if (!cnpj || !validators.isCNPJ(cnpj)) {
      throw AppError.unprocessable('CNPJ inválido.', 'INVALID_CNPJ');
    }
    cleanCnpj = validators.onlyDigits(cnpj);
  } else {
    throw AppError.unprocessable('person_type inválido.', 'INVALID_PERSON_TYPE');
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  // Pré-checagem de duplicidade (e-mail/CPF/CNPJ).
  const orConditions = [{ email: normalizedEmail }];
  if (cleanCpf) orConditions.push({ cpf: cleanCpf });
  if (cleanCnpj) orConditions.push({ cnpj: cleanCnpj });
  const existing = await db.User.findOne({ where: { [db.Sequelize.Op.or]: orConditions } });
  if (existing) {
    if (existing.email === normalizedEmail) throw AppError.conflict('E-mail já cadastrado.', 'EMAIL_TAKEN');
    if (cleanCpf && existing.cpf === cleanCpf) throw AppError.conflict('CPF já cadastrado.', 'CPF_TAKEN');
    if (cleanCnpj && existing.cnpj === cleanCnpj) throw AppError.conflict('CNPJ já cadastrado.', 'CNPJ_TAKEN');
    throw AppError.conflict('Usuário já cadastrado.', 'USER_TAKEN');
  }

  const password_hash = await passwordUtil.hash(password);

  let user;
  try {
    user = await db.sequelize.transaction(async (transaction) => {
      const created = await db.User.create(
        {
          name,
          email: normalizedEmail,
          phone: phone || null,
          password_hash,
          person_type: type,
          cpf: cleanCpf,
          cnpj: cleanCnpj,
          legal_name: legal_name || null,
        },
        { transaction }
      );
      await assignDefaultRole(created.id, transaction);
      return created;
    });
  } catch (err) {
    if (err && err.name === 'SequelizeUniqueConstraintError') {
      throw AppError.conflict('E-mail, CPF ou CNPJ já cadastrado.', 'DUPLICATE');
    }
    throw err;
  }

  return { user: sanitize(user), token: await issueToken(user) };
}

async function login({ email, password }) {
  if (!email || !password) {
    throw AppError.unprocessable('E-mail e senha são obrigatórios.');
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = await db.User.findOne({ where: { email: normalizedEmail } });
  if (!user || !user.password_hash) {
    throw AppError.unauthorized('Credenciais inválidas');
  }
  const ok = await passwordUtil.compare(password, user.password_hash);
  if (!ok) {
    throw AppError.unauthorized('Credenciais inválidas');
  }

  user.last_login_at = new Date();
  await user.save();

  return { user: sanitize(user), token: await issueToken(user) };
}

async function socialLogin({ idToken }) {
  const profile = await firebaseProvider.verifyIdToken(idToken);
  const email = profile.email ? String(profile.email).trim().toLowerCase() : null;

  let user = await db.User.findOne({
    where: {
      [db.Sequelize.Op.or]: [
        { firebase_uid: profile.uid },
        ...(email ? [{ email }] : []),
      ],
    },
  });

  if (!user) {
    user = await db.sequelize.transaction(async (transaction) => {
      const created = await db.User.create(
        {
          name: profile.name || (email ? email.split('@')[0] : 'Usuário'),
          email: email || `${profile.uid}@firebase.local`,
          person_type: 'individual',
          firebase_uid: profile.uid,
          email_verified_at: profile.emailVerified ? new Date() : null,
          avatar_url: profile.picture || null,
        },
        { transaction }
      );
      await assignDefaultRole(created.id, transaction);
      return created;
    });
  } else if (!user.firebase_uid) {
    user.firebase_uid = profile.uid;
    if (!user.email_verified_at && profile.emailVerified) user.email_verified_at = new Date();
    await user.save();
  }

  user.last_login_at = new Date();
  await user.save();

  return { user: sanitize(user), token: await issueToken(user) };
}

async function logout({ token, decoded }) {
  if (!token || !decoded) {
    throw AppError.unauthorized('Sessão inválida.');
  }
  await db.TokenBlacklist.create({
    jti: decoded.jti || null,
    token,
    user_id: decoded.sub || decoded.id || null,
    expires_at: jwtUtil.expiryDate(decoded),
    reason: 'logout',
  });
  return true;
}

async function me(userId) {
  const user = await db.User.findByPk(userId, {
    include: [{ model: db.Role, as: 'roles', through: { attributes: [] } }],
  });
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  return sanitize(user);
}

module.exports = { register, login, socialLogin, logout, me, sanitize };
