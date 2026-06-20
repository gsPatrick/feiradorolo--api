'use strict';

/**
 * Autorização baseada no RBAC granular.
 * - authorize('orders.view', ...) exige TODAS as permissões listadas.
 * - requireAdmin exige acesso administrativo (qualquer permissão de módulo admin
 *   ou is_admin). Use authorize() para granularidade fina.
 */
const permissionService = require('../services/permission.service');
const AppError = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');

function authorize(...required) {
  return catchAsync(async (req, res, next) => {
    if (!req.user) throw new AppError('Autenticação necessária.', 401, 'NO_TOKEN');
    const allowed = await permissionService.can(req.user, required);
    if (!allowed) throw new AppError('Você não tem permissão para esta ação.', 403, 'FORBIDDEN');
    next();
  });
}

const requireAdmin = catchAsync(async (req, res, next) => {
  if (!req.user) throw new AppError('Autenticação necessária.', 401, 'NO_TOKEN');
  const perms = await permissionService.getEffectivePermissions(req.user);
  const isAdmin = perms === '*' || (perms.size > 0 && [...perms].some((p) => !p.startsWith('user.') && !p.startsWith('seller.')));
  if (!isAdmin) throw new AppError('Acesso restrito a administradores.', 403, 'ADMIN_ONLY');
  next();
});

module.exports = { authorize, requireAdmin };
