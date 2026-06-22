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

/** YYYY-MM-DD (horário do servidor). */
function dayStr(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Tráfego: presença (online agora) + visitas por dia/semana/mês + série 14 dias.
 * "online" = last_seen_at >= now - 5min. Visitantes = distinct session_id/dia.
 */
async function traffic() {
  const now = new Date();
  const onlineSince = new Date(now.getTime() - 5 * 60 * 1000);
  const today = dayStr(now);
  const weekAgo = dayStr(new Date(now.getTime() - 6 * 86400000)); // hoje + 6 dias antes = 7 dias
  const monthStart = dayStr(new Date(now.getFullYear(), now.getMonth(), 1));
  const seriesStart = dayStr(new Date(now.getTime() - 13 * 86400000)); // últimos 14 dias

  const distinctSession = fn('COUNT', fn('DISTINCT', col('session_id')));
  const distinctUser = fn('COUNT', fn('DISTINCT', col('user_id')));

  const [onlineRow, usersRow, todayRow, weekRow, monthRow, seriesRows] = await Promise.all([
    // online_now: distinct session_id com last_seen_at recente.
    db.SiteSession.findOne({
      attributes: [[distinctSession, 'c']],
      where: { last_seen_at: { [Op.gte]: onlineSince } },
      raw: true,
    }),
    // online_users: distinct user_id (logados) online agora.
    db.SiteSession.findOne({
      attributes: [[distinctUser, 'c']],
      where: { last_seen_at: { [Op.gte]: onlineSince }, user_id: { [Op.ne]: null } },
      raw: true,
    }),
    // visitors_today + page_hits_today (linhas do dia = sessão distinta/dia).
    db.SiteSession.findOne({
      attributes: [
        [fn('COUNT', col('id')), 'visitors'],
        [fn('COALESCE', fn('SUM', col('hits')), 0), 'hits'],
      ],
      where: { day: today },
      raw: true,
    }),
    // visitors_week: distinct session_id nos últimos 7 dias.
    db.SiteSession.findOne({
      attributes: [[distinctSession, 'c']],
      where: { day: { [Op.gte]: weekAgo } },
      raw: true,
    }),
    // visitors_month: distinct session_id no mês corrente.
    db.SiteSession.findOne({
      attributes: [[distinctSession, 'c']],
      where: { day: { [Op.gte]: monthStart } },
      raw: true,
    }),
    // série últimos 14 dias: visitantes (sessões distintas) por dia.
    db.SiteSession.findAll({
      attributes: ['day', [distinctSession, 'visitors']],
      where: { day: { [Op.gte]: seriesStart } },
      group: ['day'],
      order: [['day', 'ASC']],
      raw: true,
    }),
  ]);

  // Preenche os 14 dias (inclui dias sem visitas com 0).
  const byDay = {};
  seriesRows.forEach((r) => { byDay[r.day] = N(r.visitors); });
  const series = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = dayStr(new Date(now.getTime() - i * 86400000));
    series.push({ date: d, visitors: byDay[d] || 0 });
  }

  return {
    online_now: N(onlineRow?.c),
    online_users: N(usersRow?.c),
    visitors_today: N(todayRow?.visitors),
    visitors_week: N(weekRow?.c),
    visitors_month: N(monthRow?.c),
    page_hits_today: N(todayRow?.hits),
    series,
  };
}

module.exports = { overview, systemHealth, dashboard, traffic };
