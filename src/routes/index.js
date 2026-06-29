'use strict';

/**
 * Agregador único de rotas da versão atual da API (/api/v1).
 * Cada feature expõe um Express Router em src/features/<nome>/<nome>.routes.js.
 */
const { Router } = require('express');

const router = Router();

// Health/probe.
router.get('/ping', (req, res) => res.json({ success: true, data: { pong: true, ts: Date.now() } }));

// Features.
router.use('/auth', require('../features/auth/auth.routes'));
router.use('/users', require('../features/user/user.routes'));
router.use('/admin', require('../features/platform-settings/platform-settings.routes'));
router.use('/config', require('../features/config/config.routes'));
router.use('/banners', require('../features/banner/banner.routes'));
router.use('/content-pages', require('../features/content/content.routes'));
router.use('/categories', require('../features/category/category.routes'));
router.use('/products', require('../features/product/product.routes'));
router.use('/uploads', require('../features/upload/upload.routes'));
router.use('/favorites', require('../features/favorite/favorite.routes'));
router.use('/coupons', require('../features/coupon/coupon.routes'));
router.use('/addresses', require('../features/address/address.routes'));
router.use('/reviews', require('../features/review/review.routes'));
router.use('/questions', require('../features/question/question.routes'));
router.use('/orders', require('../features/order/order.routes'));
router.use('/payments', require('../features/payment/payment.routes'));
router.use('/plans', require('../features/plan/plan.routes'));
router.use('/escrow', require('../features/escrow/escrow.routes'));
router.use('/disputes', require('../features/dispute/dispute.routes'));
router.use('/shipments', require('../features/shipment/shipment.routes'));
router.use('/chats', require('../features/chat/chat.routes'));
router.use('/reports', require('../features/report/report.routes'));
router.use('/notifications', require('../features/notification/notification.routes'));
router.use('/analytics', require('../features/analytics/analytics.routes'));
router.use('/email-templates', require('../features/email-template/email-template.routes'));
router.use('/verification', require('../features/verification/verification.routes'));
router.use('/presence', require('../features/presence/presence.routes'));
router.use('/fipe', require('../features/fipe/fipe.routes'));

module.exports = router;
