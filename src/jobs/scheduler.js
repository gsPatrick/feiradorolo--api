'use strict';

/**
 * Agendador de tarefas (node-cron). Hoje: liberação automática de escrow cujo
 * prazo de retenção (7 dias) venceu e sem disputa aberta. Roda de hora em hora.
 */
const cron = require('node-cron');
const logger = require('../utils/logger');

function start() {
  // A cada hora, no minuto 5.
  cron.schedule('5 * * * *', async () => {
    try {
      const escrowService = require('../features/escrow/escrow.service');
      const released = await escrowService.releaseDue();
      if (released && released.length) {
        logger.info(`Escrow: ${released.length} custódia(s) liberada(s) automaticamente.`);
      }
    } catch (err) {
      logger.error('Job de liberação de escrow falhou:', err.message);
    }
  });

  logger.info('Scheduler iniciado (liberação automática de escrow).');
}

module.exports = { start };
