'use strict';

/**
 * Rotas ADMIN do módulo `platform-settings`. Montado em /admin (sob /api/v1).
 * Todas exigem autenticação (auth) e RBAC granular (authorize) por recurso.
 */
const { Router } = require('express');
const { auth } = require('../../middlewares/auth');
const { authorize } = require('../../middlewares/roleCheck');
const controller = require('./platform-settings.controller');

const router = Router();

// Autenticação obrigatória em todo o módulo admin.
router.use(auth);

/* ------------------------------ platform_settings ------------------------ */
router.get('/settings', authorize('settings.view'), controller.listSettings);
router.get('/settings/:key', authorize('settings.view'), controller.getSetting);
router.put('/settings/:key', authorize('settings.manage'), controller.updateSetting);
router.post('/settings/:key/restore', authorize('settings.manage'), controller.restoreSetting);

/* ------------------------------ commission_rules ------------------------- */
router.get('/commission-rules', authorize('revenue.view'), controller.listCommissionRules);
router.post('/commission-rules', authorize('revenue.manage'), controller.createCommissionRule);
router.put('/commission-rules/:id', authorize('revenue.manage'), controller.updateCommissionRule);
router.delete('/commission-rules/:id', authorize('revenue.manage'), controller.deleteCommissionRule);

/* ------------------------------ highlight_packages ----------------------- */
router.get('/highlight-packages', authorize('revenue.view'), controller.listHighlightPackages);
router.post('/highlight-packages', authorize('revenue.manage'), controller.createHighlightPackage);
router.put('/highlight-packages/:id', authorize('revenue.manage'), controller.updateHighlightPackage);
router.delete('/highlight-packages/:id', authorize('revenue.manage'), controller.deleteHighlightPackage);

/* ------------------------------ category_pricing ------------------------- */
router.get('/category-pricing', authorize('revenue.view'), controller.listCategoryPricing);
router.post('/category-pricing', authorize('revenue.manage'), controller.createCategoryPricing);
router.put('/category-pricing/:id', authorize('revenue.manage'), controller.updateCategoryPricing);
router.delete('/category-pricing/:id', authorize('revenue.manage'), controller.deleteCategoryPricing);

/* ------------------------------ shipping_settings ------------------------ */
router.get('/shipping-settings', authorize('revenue.view'), controller.listShippingSettings);
router.post('/shipping-settings', authorize('revenue.manage'), controller.createShippingSetting);
router.put('/shipping-settings/:id', authorize('revenue.manage'), controller.updateShippingSetting);
router.delete('/shipping-settings/:id', authorize('revenue.manage'), controller.deleteShippingSetting);

/* ------------------------------ payment_gateway_settings ----------------- */
router.get('/gateways', authorize('integrations.view'), controller.listGateways);
router.post('/gateways', authorize('integrations.manage'), controller.createGateway);
router.put('/gateways/:id', authorize('integrations.manage'), controller.updateGateway);
router.post('/gateways/:id/activate', authorize('integrations.manage'), controller.activateGateway);

/* ------------------------------ integration_settings --------------------- */
router.get('/integrations', authorize('integrations.view'), controller.listIntegrations);
router.post('/integrations', authorize('integrations.manage'), controller.createIntegration);
router.put('/integrations/:id', authorize('integrations.manage'), controller.updateIntegration);
router.post('/integrations/:id/activate', authorize('integrations.manage'), controller.activateIntegration);

/* ------------------------------ blocked_words ---------------------------- */
router.get('/blocked-words', authorize('security.view'), controller.listBlockedWords);
router.post('/blocked-words', authorize('security.manage'), controller.createBlockedWord);
router.put('/blocked-words/:id', authorize('security.manage'), controller.updateBlockedWord);
router.delete('/blocked-words/:id', authorize('security.manage'), controller.deleteBlockedWord);

/* ------------------------------ setting_change_logs ---------------------- */
router.get('/setting-logs', authorize('audit.view'), controller.listSettingLogs);

module.exports = router;
