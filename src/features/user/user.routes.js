'use strict';

/** Rotas de usuários (/api/v1/users). */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./user.controller');

const router = Router();

// Perfil corrente e verificação facial (ordem antes de '/:id' para evitar colisão).
router.patch('/me', auth, controller.updateMe);
router.post('/me/validate-document', auth, controller.validateDocument);
router.post('/me/verification', auth, controller.submitVerification);
router.get('/me/verification', auth, controller.myVerifications);

// Revisão de verificação (admin/moderador).
router.patch('/verification/:id/review', auth, authorize('users.verify'), controller.reviewVerification);

// Gestão de papéis (RBAC).
router.post('/:id/roles', auth, authorize('rbac.manage'), controller.assignRole);
router.delete('/:id/roles/:slug', auth, authorize('rbac.manage'), controller.removeRole);

// Banimentos.
router.post('/:id/ban', auth, authorize('users.ban'), controller.ban);
router.post('/:id/unban', auth, authorize('users.ban'), controller.unban);

// Perfil público de vendedor (reputação + selo de confiança) — SEM auth.
// Antes de '/:id' (protegido) para a rota pública ser resolvida primeiro.
router.get('/:id/seller-profile', controller.sellerProfile);

// Listagem e detalhe.
router.get('/', auth, authorize('users.view'), controller.list);
router.get('/:id', auth, authorize('users.view'), controller.getById);

module.exports = router;
