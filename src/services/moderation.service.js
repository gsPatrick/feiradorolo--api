'use strict';

/**
 * Moderação de conteúdo a partir de blocked_words (aba Segurança). Faz cache
 * curto das palavras ativas e avalia um texto retornando a ação resultante.
 */
const db = require('../models');

const TTL_MS = Number(process.env.MODERATION_CACHE_TTL_MS || 60000);
let cache = { at: 0, words: [] };

function invalidate() {
  cache = { at: 0, words: [] };
}

async function loadWords(scope) {
  if (Date.now() - cache.at >= TTL_MS) {
    const rows = await db.BlockedWord.findAll({ where: { is_active: true } });
    cache = { at: Date.now(), words: rows.map((r) => r.toJSON()) };
  }
  return cache.words.filter((w) => w.scope === 'all' || w.scope === scope);
}

function buildMatcher(w) {
  if (w.is_regex) {
    try {
      return new RegExp(w.word, 'gi');
    } catch (e) {
      return null;
    }
  }
  const escaped = w.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'gi');
}

/**
 * Avalia um texto. Retorna:
 *  { allowed, moderationStatus, containsBlockedWords, matched, sanitized, reason }
 * - action 'block' => allowed=false, status 'blocked'
 * - action 'flag'  => allowed=true,  status 'flagged'
 * - action 'mask'  => allowed=true,  status 'clean', texto mascarado
 */
async function evaluate(text, scope = 'chat') {
  const content = String(text || '');
  const words = await loadWords(scope);
  const matched = [];
  let sanitized = content;
  let block = false;
  let flag = false;
  let mask = false;

  for (const w of words) {
    const re = buildMatcher(w);
    if (!re) continue;
    if (re.test(content)) {
      matched.push(w.word);
      if (w.action === 'block') block = true;
      else if (w.action === 'flag') flag = true;
      else if (w.action === 'mask') {
        mask = true;
        sanitized = sanitized.replace(buildMatcher(w), (m) => '*'.repeat(m.length));
      }
    }
  }

  let moderationStatus = 'clean';
  if (block) moderationStatus = 'blocked';
  else if (flag) moderationStatus = 'flagged';

  return {
    allowed: !block,
    moderationStatus,
    containsBlockedWords: matched.length > 0,
    matched,
    sanitized: mask ? sanitized : content,
    reason: matched.length ? `Termos: ${matched.join(', ')}` : null,
  };
}

module.exports = { evaluate, invalidate };
