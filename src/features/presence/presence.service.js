'use strict';

/** Registra/atualiza presença de uma sessão anônima no dia corrente. */
const db = require('../../models');

/** YYYY-MM-DD no horário do servidor. */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Heartbeat: cria a linha (sessão/dia) ou atualiza last_seen_at/hits.
 * Robusto: nunca lança — em caso de erro retorna { ok: false }.
 */
async function ping({ session_id, path = null, user_id = null } = {}) {
  if (typeof session_id !== 'string' || !session_id.trim()) {
    return { ok: false, reason: 'invalid_session_id' };
  }
  const sid = session_id.trim().slice(0, 255);
  const now = new Date();
  const day = today();

  try {
    const [row, created] = await db.SiteSession.findOrCreate({
      where: { session_id: sid, day },
      defaults: {
        session_id: sid,
        day,
        user_id: user_id || null,
        first_seen_at: now,
        last_seen_at: now,
        hits: 1,
        path: path ? String(path).slice(0, 255) : null,
      },
    });

    if (!created) {
      await row.update({
        last_seen_at: now,
        hits: (row.hits || 0) + 1,
        path: path ? String(path).slice(0, 255) : row.path,
        user_id: user_id || row.user_id || null,
      });
    }
    return { ok: true };
  } catch (err) {
    // Corrida no findOrCreate (unique session_id/day) ou erro transitório:
    // não derruba a requisição.
    return { ok: false, reason: 'error' };
  }
}

module.exports = { ping };
