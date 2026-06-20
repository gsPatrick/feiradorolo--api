'use strict';

/**
 * Controller (HTTP-only) do módulo ADMIN `platform-settings`.
 * Mantém-se fino: extrai parâmetros do request, delega ao service e formata a
 * resposta padronizada. Toda regra de negócio, validação severa, criptografia,
 * auditoria e invalidação de cache vivem no service.
 */
const catchAsync = require('../../utils/catchAsync');
const { sendOk, sendCreated, sendNoContent, paginated } = require('../../utils/apiResponse');
const service = require('./platform-settings.service');

/* ------------------------------ platform_settings ------------------------ */
const listSettings = catchAsync(async (req, res) => {
  const rows = await service.listSettings();
  return sendOk(res, rows);
});

const getSetting = catchAsync(async (req, res) => {
  const row = await service.getSetting(req.params.key);
  return sendOk(res, row);
});

const updateSetting = catchAsync(async (req, res) => {
  const row = await service.updateSetting(req.params.key, req.body.value, req);
  return sendOk(res, row, 'Configuração atualizada.');
});

const restoreSetting = catchAsync(async (req, res) => {
  const row = await service.restoreSetting(req.params.key, req);
  return sendOk(res, row, 'Configuração restaurada ao padrão.');
});

/* ------------------------------ commission_rules ------------------------- */
const listCommissionRules = catchAsync(async (req, res) => {
  return sendOk(res, await service.listCommissionRules());
});
const createCommissionRule = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createCommissionRule(req.body, req));
});
const updateCommissionRule = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateCommissionRule(req.params.id, req.body, req), 'Regra atualizada.');
});
const deleteCommissionRule = catchAsync(async (req, res) => {
  await service.deleteCommissionRule(req.params.id, req);
  return sendNoContent(res);
});

/* ------------------------------ highlight_packages ----------------------- */
const listHighlightPackages = catchAsync(async (req, res) => {
  return sendOk(res, await service.listHighlightPackages());
});
const createHighlightPackage = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createHighlightPackage(req.body, req));
});
const updateHighlightPackage = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateHighlightPackage(req.params.id, req.body, req), 'Pacote atualizado.');
});
const deleteHighlightPackage = catchAsync(async (req, res) => {
  await service.deleteHighlightPackage(req.params.id, req);
  return sendNoContent(res);
});

/* ------------------------------ category_pricing ------------------------- */
const listCategoryPricing = catchAsync(async (req, res) => {
  return sendOk(res, await service.listCategoryPricing());
});
const createCategoryPricing = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createCategoryPricing(req.body, req));
});
const updateCategoryPricing = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateCategoryPricing(req.params.id, req.body, req), 'Precificação atualizada.');
});
const deleteCategoryPricing = catchAsync(async (req, res) => {
  await service.deleteCategoryPricing(req.params.id, req);
  return sendNoContent(res);
});

/* ------------------------------ shipping_settings ------------------------ */
const listShippingSettings = catchAsync(async (req, res) => {
  return sendOk(res, await service.listShippingSettings());
});
const createShippingSetting = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createShippingSetting(req.body, req));
});
const updateShippingSetting = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateShippingSetting(req.params.id, req.body, req), 'Frete atualizado.');
});
const deleteShippingSetting = catchAsync(async (req, res) => {
  await service.deleteShippingSetting(req.params.id, req);
  return sendNoContent(res);
});

/* ------------------------------ payment_gateway_settings ----------------- */
const listGateways = catchAsync(async (req, res) => {
  return sendOk(res, await service.listGateways());
});
const createGateway = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createGateway(req.body, req));
});
const updateGateway = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateGateway(req.params.id, req.body, req), 'Gateway atualizado.');
});
const activateGateway = catchAsync(async (req, res) => {
  return sendOk(res, await service.activateGateway(req.params.id, req), 'Gateway ativado.');
});

/* ------------------------------ integration_settings --------------------- */
const listIntegrations = catchAsync(async (req, res) => {
  return sendOk(res, await service.listIntegrations());
});
const createIntegration = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createIntegration(req.body, req));
});
const updateIntegration = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateIntegration(req.params.id, req.body, req), 'Integração atualizada.');
});
const activateIntegration = catchAsync(async (req, res) => {
  return sendOk(res, await service.activateIntegration(req.params.id, req), 'Integração ativada.');
});

/* ------------------------------ blocked_words ---------------------------- */
const listBlockedWords = catchAsync(async (req, res) => {
  return sendOk(res, await service.listBlockedWords());
});
const createBlockedWord = catchAsync(async (req, res) => {
  return sendCreated(res, await service.createBlockedWord(req.body, req));
});
const updateBlockedWord = catchAsync(async (req, res) => {
  return sendOk(res, await service.updateBlockedWord(req.params.id, req.body, req), 'Palavra atualizada.');
});
const deleteBlockedWord = catchAsync(async (req, res) => {
  await service.deleteBlockedWord(req.params.id, req);
  return sendNoContent(res);
});

/* ------------------------------ setting_change_logs ---------------------- */
const listSettingLogs = catchAsync(async (req, res) => {
  const result = await service.listSettingLogs({
    page: req.query.page,
    limit: req.query.limit,
    entity: req.query.entity,
  });
  return paginated(res, result.rows, { page: result.page, limit: result.limit, total: result.total });
});

module.exports = {
  // platform_settings
  listSettings,
  getSetting,
  updateSetting,
  restoreSetting,
  // commission_rules
  listCommissionRules,
  createCommissionRule,
  updateCommissionRule,
  deleteCommissionRule,
  // highlight_packages
  listHighlightPackages,
  createHighlightPackage,
  updateHighlightPackage,
  deleteHighlightPackage,
  // category_pricing
  listCategoryPricing,
  createCategoryPricing,
  updateCategoryPricing,
  deleteCategoryPricing,
  // shipping_settings
  listShippingSettings,
  createShippingSetting,
  updateShippingSetting,
  deleteShippingSetting,
  // payment_gateway_settings
  listGateways,
  createGateway,
  updateGateway,
  activateGateway,
  // integration_settings
  listIntegrations,
  createIntegration,
  updateIntegration,
  activateIntegration,
  // blocked_words
  listBlockedWords,
  createBlockedWord,
  updateBlockedWord,
  deleteBlockedWord,
  // logs
  listSettingLogs,
};
