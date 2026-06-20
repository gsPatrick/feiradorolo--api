'use strict';

/**
 * Crawler da API antiga (Replit) — captura a taxonomia COMPLETA e as especificações
 * tipadas, exatamente como o front antigo esperava.
 *   GET /api/categories                      -> árvore completa (2068 cats, 4 níveis)
 *   GET /api/field-definitions/:id           -> campos tipados da categoria
 *   GET /api/categories/:id/specifications   -> pools de opções (brand, material, ...)
 *
 * Saída: seeders/data/old-api-dump.json { categories, fieldDefs, options }
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://66d02250-44b7-4c56-9779-a56bc8847bfd-00-12a96hkb4v3xv.picard.replit.dev';
const OUT = path.join(__dirname, 'old-api-dump.json');
const CONCURRENCY = 8;
const OPTION_CAP = 5000; // teto por campo (brand chega a ~3190)

async function getJSON(p, attempt = 0) {
  try {
    const r = await fetch(BASE + p, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    if (attempt < 3) {
      await new Promise((res) => setTimeout(res, 500 * (attempt + 1)));
      return getJSON(p, attempt + 1);
    }
    return null;
  }
}

async function pool(items, worker) {
  const results = new Array(items.length);
  let i = 0;
  const runners = Array.from({ length: CONCURRENCY }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

(async () => {
  console.log('1/3 baixando árvore completa...');
  const cats = await getJSON('/api/categories');
  if (!Array.isArray(cats)) throw new Error('Falha ao baixar /api/categories');
  console.log(`   ${cats.length} categorias.`);

  console.log('2/3 baixando field-definitions de cada categoria...');
  const fieldDefs = {};
  let done = 0;
  await pool(cats, async (c) => {
    const fd = await getJSON(`/api/field-definitions/${c.id}`);
    if (Array.isArray(fd) && fd.length) fieldDefs[c.id] = fd;
    if (++done % 200 === 0) console.log(`   ${done}/${cats.length}`);
  });
  const withFields = Object.keys(fieldDefs);
  console.log(`   ${withFields.length} categorias com campos.`);

  console.log('3/3 baixando pools de opções (só categorias com campos)...');
  const options = {};
  done = 0;
  await pool(withFields, async (catId) => {
    const pools = await getJSON(`/api/categories/${catId}/specifications`);
    if (pools && typeof pools === 'object') {
      const trimmed = {};
      for (const [k, v] of Object.entries(pools)) {
        if (Array.isArray(v) && v.length) trimmed[k] = v.slice(0, OPTION_CAP);
      }
      if (Object.keys(trimmed).length) options[catId] = trimmed;
    }
    if (++done % 100 === 0) console.log(`   ${done}/${withFields.length}`);
  });

  fs.writeFileSync(OUT, JSON.stringify({ categories: cats, fieldDefs, options }));
  const mb = (fs.statSync(OUT).size / 1024 / 1024).toFixed(1);
  console.log(`PRONTO -> ${OUT} (${mb} MB)`);
  console.log(`categorias=${cats.length} comCampos=${withFields.length} comOpcoes=${Object.keys(options).length}`);
})().catch((e) => {
  console.error('ERRO no crawler:', e.message);
  process.exit(1);
});
