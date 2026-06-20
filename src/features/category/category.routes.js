'use strict';

/**
 * Rotas de Categorias e Especificações (field_definitions).
 * Públicas: listagem, árvore, detalhe por slug e campos.
 * Restritas: criação/edição/remoção (specifications.manage).
 */
const { Router } = require('express');
const { optionalAuth, auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./category.controller');

const router = Router();

// Públicas (enriquecem quando há sessão).
router.get('/', optionalAuth, controller.list);
router.get('/tree', optionalAuth, controller.tree);
router.get('/:id/fields', controller.listFields);
router.get('/:slug', optionalAuth, controller.getBySlug);

// Gestão de categorias.
router.post('/', auth, authorize('specifications.manage'), controller.create);
router.put('/:id', auth, authorize('specifications.manage'), controller.update);
router.delete('/:id', auth, authorize('specifications.manage'), controller.remove);

// Gestão de especificações (field_definitions).
router.post('/:id/fields', auth, authorize('specifications.manage'), controller.addField);
router.put('/fields/:fieldId', auth, authorize('specifications.manage'), controller.updateField);
router.delete('/fields/:fieldId', auth, authorize('specifications.manage'), controller.removeField);

module.exports = router;
