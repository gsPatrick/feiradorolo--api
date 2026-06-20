'use strict';

/**
 * Entrada da API Feira do Rolo. Instancia o Express, middlewares globais de
 * segurança, monta as rotas sob o prefixo /api/v1, registra o handler de erro,
 * sobe o Socket.io e o agendador, e inicia o servidor HTTP.
 */
require('dotenv').config();

const http = require('http');
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const { sequelize } = require('./config/database');
const settings = require('./src/services/settings.cache');
const apiRoutes = require('./src/routes');
const notFound = require('./src/middlewares/notFound');
const errorHandler = require('./src/middlewares/errorHandler');
const { initSocket } = require('./src/realtime/socket');
const scheduler = require('./src/jobs/scheduler');
const logger = require('./src/utils/logger');

const app = express();
const API_PREFIX = process.env.APP_API_PREFIX || '/api/v1';

// CORS dinâmico: a allowlist vem de platform_settings 'app.cors_origins' (admin).
async function corsOrigin(origin, cb) {
  if (!origin) return cb(null, true); // requests sem Origin (curl, server-to-server, webhooks)
  try {
    const list = await settings.get('app.cors_origins', ['*']);
    const allowed = Array.isArray(list) ? list : [list];
    return cb(null, allowed.includes('*') || allowed.includes(origin));
  } catch (e) {
    return cb(null, true);
  }
}

// Middlewares globais.
app.use(helmet());
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Arquivos enviados (banners, imagens) — servidos estaticamente (cross-origin liberado).
app.use(
  '/uploads',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  },
  express.static(path.join(__dirname, 'public', 'uploads'))
);

// Health raiz (para orquestração/probes).
app.get('/health', (req, res) => res.json({ success: true, data: { status: 'ok', uptime: process.uptime() } }));

// Rotas versionadas.
app.use(API_PREFIX, apiRoutes);

// 404 + erro centralizado.
app.use(notFound);
app.use(errorHandler);

// Servidor HTTP + WebSocket.
const server = http.createServer(app);
initSocket(server);

async function start() {
  const PORT = process.env.PORT || 3333;
  try {
    await sequelize.authenticate();
    logger.info('Conexão com o PostgreSQL estabelecida.');
  } catch (err) {
    logger.error('Falha ao conectar no banco:', err.message);
  }
  scheduler.start();
  server.listen(PORT, () => logger.info(`API ouvindo em :${PORT} (prefixo ${API_PREFIX})`));
}

if (require.main === module) {
  start();
}

module.exports = { app, server, start };
