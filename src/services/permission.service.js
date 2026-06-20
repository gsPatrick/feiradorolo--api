'use strict';

/**
 * Resolução de permissões do RBAC granular, com cache curto por usuário.
 * Efetivo = (permissões dos papéis ativos) ∪ (overrides allow) − (overrides deny).
 * `users.is_admin = true` concede acesso total ('*').
 */
const { Op } = require('sequelize');
const db = require('../models');

const TTL_MS = Number(process.env.PERMISSION_CACHE_TTL_MS || 30000);
const cache = new Map(); // userId -> { at, perms: Set|'*' }

function invalidate(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

async function getEffectivePermissions(user) {
  if (!user) return new Set();
  if (user.is_admin) return '*';

  const hit = cache.get(user.id);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.perms;

  const now = new Date();
  const notExpired = { [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }] };

  // Permissões herdadas dos papéis ativos.
  const userRoles = await db.UserRole.findAll({
    where: { user_id: user.id, ...notExpired },
    include: [{
      model: db.Role, as: 'role', where: { is_active: true }, required: true,
      include: [{ model: db.Permission, as: 'permissions', through: { attributes: [] } }],
    }],
  });

  const perms = new Set();
  for (const ur of userRoles) {
    for (const p of ur.role.permissions || []) perms.add(p.key);
  }

  // Overrides diretos do usuário.
  const overrides = await db.UserPermission.findAll({
    where: { user_id: user.id, ...notExpired },
    include: [{ model: db.Permission, as: 'permission', required: true }],
  });
  for (const o of overrides) {
    if (o.effect === 'allow') perms.add(o.permission.key);
    else perms.delete(o.permission.key);
  }

  cache.set(user.id, { at: Date.now(), perms });
  return perms;
}

/** True se o usuário possui TODAS as permissões exigidas. */
async function can(user, required = []) {
  const perms = await getEffectivePermissions(user);
  if (perms === '*') return true;
  const list = Array.isArray(required) ? required : [required];
  return list.every((k) => perms.has(k));
}

module.exports = { getEffectivePermissions, can, invalidate };
