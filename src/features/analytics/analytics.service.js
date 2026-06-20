'use strict';

/**
 * Métricas agregadas para o painel admin (analytics, dashboard, performance).
 * Usa dados reais de Order/User/Product/Review. Comissão vem do snapshot
 * `commission_amount` do pedido (não recalculada).
 */
const os = require('os');
const { Op, fn, col, literal } = require('sequelize');
const db = require('../../models');

const ACTIVE = { status: { [Op.notIn]: ['cancelled', 'refunded'] } };
const N = (v) => Number(v) || 0;

async function revenueWhere(where = {}) {
  const r = await db.Order.findOne({
    where: { ...ACTIVE, ...where },
    attributes: [
      [fn('COALESCE', fn('SUM', col('total')), 0), 'total'],
      [fn('COALESCE', fn('SUM', col('commission_amount')), 0), 'commission'],
      [fn('COUNT', col('id')), 'count'],
    ],
    raw: true,
  });
  return { total: N(r.total), commission: N(r.commission), count: N(r.count) };
}

async function overview({ period = 30 } = {}) {
  const days = [7, 30, 90].includes(Number(period)) ? Number(period) : 30;
  const now = Date.now();
  const since = new Date(now - days * 86400000);
  const prevSince = new Date(now - days * 2 * 86400000);
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const weekStart = new Date(now - 7 * 86400000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const [all, today, week, month, current, previous] = await Promise.all([
    revenueWhere(),
    revenueWhere({ created_at: { [Op.gte]: todayStart } }),
    revenueWhere({ created_at: { [Op.gte]: weekStart } }),
    revenueWhere({ created_at: { [Op.gte]: monthStart } }),
    revenueWhere({ created_at: { [Op.gte]: since } }),
    revenueWhere({ created_at: { [Op.gte]: prevSince, [Op.lt]: since } }),
  ]);

  // Pedidos por status.
  const statusRows = await db.Order.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'c']],
    group: ['status'],
    raw: true,
  });
  const byStatus = {};
  let totalOrders = 0;
  statusRows.forEach((r) => {
    byStatus[r.status] = N(r.c);
    totalOrders += N(r.c);
  });
  const bucket = (...keys) => keys.reduce((s, k) => s + (byStatus[k] || 0), 0);

  // Usuários.
  const [totalUsers, totalSellers, activeSellers, newUsers] = await Promise.all([
    db.User.count(),
    db.User.count({ where: { is_seller: true } }),
    db.User.count({ where: { is_seller: true, last_login_at: { [Op.gte]: new Date(now - 30 * 86400000) } } }),
    db.User.count({ where: { created_at: { [Op.gte]: monthStart } } }),
  ]);

  // Top vendedores.
  const sellerRows = await db.Order.findAll({
    where: ACTIVE,
    attributes: [
      'seller_id',
      [fn('SUM', col('total')), 'revenue'],
      [fn('SUM', col('commission_amount')), 'commission'],
      [fn('COUNT', col('id')), 'orders'],
    ],
    group: ['seller_id'],
    order: [[literal('revenue'), 'DESC']],
    limit: 10,
    raw: true,
  });
  const sellers = await db.User.findAll({
    where: { id: { [Op.in]: sellerRows.map((s) => s.seller_id) } },
    attributes: ['id', 'name'],
    raw: true,
  });
  const sellerName = Object.fromEntries(sellers.map((s) => [s.id, s.name]));
  const topSellers = sellerRows.map((s) => ({
    sellerId: s.seller_id,
    sellerName: sellerName[s.seller_id] || 'Vendedor',
    revenue: N(s.revenue),
    platformCommission: N(s.commission),
    orders: N(s.orders),
  }));

  // Série temporal (por dia, dentro do período).
  const chartRows = await db.Order.findAll({
    where: { ...ACTIVE, created_at: { [Op.gte]: since } },
    attributes: [
      [fn('to_char', fn('date_trunc', 'day', col('created_at')), 'YYYY-MM-DD'), 'date'],
      [fn('SUM', col('total')), 'revenue'],
      [fn('SUM', col('commission_amount')), 'platformRevenue'],
    ],
    group: [literal("date_trunc('day', created_at)")],
    order: [literal("date_trunc('day', created_at)")],
    raw: true,
  });
  const revenueChart = chartRows.map((r) => ({ date: r.date, revenue: N(r.revenue), platformRevenue: N(r.platformRevenue) }));

  const pct = (cur, prev) => (prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : cur > 0 ? 100 : 0);

  return {
    period: days,
    revenue: { total: all.total, today: today.total, thisWeek: week.total, thisMonth: month.total, platformCommission: all.commission },
    orders: {
      total: totalOrders,
      pending: bucket('pending', 'awaiting_payment'),
      paid: bucket('paid', 'processing'),
      shipped: bucket('shipped'),
      delivered: bucket('delivered', 'completed'),
      completed: bucket('delivered', 'completed'),
      cancelled: bucket('cancelled', 'refunded'),
    },
    users: { totalBuyers: totalUsers - totalSellers, totalSellers, activeSellers, newThisMonth: newUsers },
    topSellers,
    revenueChart,
    growth: { revenue: pct(current.total, previous.total), orders: pct(current.count, previous.count), commission: pct(current.commission, previous.commission) },
  };
}

/** Saúde do sistema (performance) — métricas reais de processo + ping no banco. */
async function systemHealth() {
  const mem = process.memoryUsage();
  let dbOk = true;
  let dbLatency = 0;
  try {
    const t = Date.now();
    await db.sequelize.query('SELECT 1');
    dbLatency = Date.now() - t;
  } catch (e) {
    dbOk = false;
  }

  const [orders, users, products, chats] = await Promise.all([
    db.Order.count(),
    db.User.count(),
    db.Product.count(),
    db.Chat.count(),
  ]);

  return {
    uptime: Math.round(process.uptime()),
    nodeVersion: process.version,
    platform: `${process.platform} ${process.arch}`,
    memory: {
      rssMB: Math.round(mem.rss / 1048576),
      heapUsedMB: Math.round(mem.heapUsed / 1048576),
      heapTotalMB: Math.round(mem.heapTotal / 1048576),
    },
    cpuCount: os.cpus().length,
    loadAvg: os.loadavg().map((n) => Math.round(n * 100) / 100),
    database: { status: dbOk ? 'online' : 'offline', latencyMs: dbLatency },
    counts: { orders, users, products, chats },
    services: [
      { name: 'PostgreSQL', status: dbOk ? 'online' : 'offline', latency: dbLatency },
      { name: 'API', status: 'online', latency: 0 },
    ],
    timestamp: new Date().toISOString(),
  };
}

/** Métricas do dashboard admin (contadores reais para os cards/ações rápidas). */
async function dashboard() {
  const todayStart = new Date(new Date().setHours(0, 0, 0, 0));
  const OPEN_DISPUTE = ['open', 'under_review', 'awaiting_response'];
  const PENDING_ORDER = ['pending', 'awaiting_payment'];

  const [today, allAgg, ordersToday, pendingOrders, pendingPayments, flaggedMessages, openDisputes, newUsersToday, totalUsers, lowStock] =
    await Promise.all([
      revenueWhere({ created_at: { [Op.gte]: todayStart } }),
      revenueWhere(),
      db.Order.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      db.Order.count({ where: { status: { [Op.in]: PENDING_ORDER } } }),
      db.Order.count({ where: { payment_status: 'pending' } }),
      db.Message.count({ where: { moderation_status: { [Op.in]: ['flagged', 'blocked'] } } }),
      db.Dispute.count({ where: { status: { [Op.in]: OPEN_DISPUTE } } }),
      db.User.count({ where: { created_at: { [Op.gte]: todayStart } } }),
      db.User.count(),
      db.Product.count({ where: { status: 'active', stock: { [Op.lte]: 5 } } }),
    ]);

  const avgOrderValue = allAgg.count > 0 ? Math.round((allAgg.total / allAgg.count) * 100) / 100 : 0;

  // Listas para "Ações Rápidas".
  const recentPending = await db.Order.findAll({
    where: { status: { [Op.in]: PENDING_ORDER } },
    attributes: ['id', 'order_number', 'total', 'status', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: 5,
  });
  const recentDisputes = await db.Dispute.findAll({
    where: { status: { [Op.in]: OPEN_DISPUTE } },
    attributes: ['id', 'order_id', 'reason', 'status', 'created_at'],
    order: [['created_at', 'DESC']],
    limit: 5,
  });

  return {
    ordersToday,
    revenueToday: today.total,
    avgOrderValue,
    totalUsers,
    newUsersToday,
    pendingOrders,
    pendingPayments,
    flaggedMessages,
    openDisputes,
    lowStock,
    recentPending,
    recentDisputes,
  };
}

module.exports = { overview, systemHealth, dashboard };
