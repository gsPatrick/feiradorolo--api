'use strict';

/**
 * Preenche campos "Marca" que ficaram com placeholder (≤ poucas opções) após o
 * import legado. Para cada Marca "magra", copia o maior pool de marcas de uma
 * categoria IRMÃ (mesma categoria de topo) — marcas reais e limpas, já presentes
 * no banco. Se a categoria de topo não tiver pool, usa o maior pool global.
 *
 * Idempotente: só toca em campos Marca com menos de THIN opções; rodar de novo
 * não duplica nada. Roda depois de 20260101010014-field-definitions-legacy.
 */
const THIN = 50;
const BRAND_LABELS = ['marca', 'fabricante']; // rótulos tratados como "marca"

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

module.exports = {
  async up(queryInterface) {
    const sql = queryInterface.sequelize;

    // 1) categorias → mapa de topo (ancestral raiz)
    const cats = await sql.query('SELECT id, parent_id FROM categories', { type: sql.QueryTypes.SELECT });
    const parentOf = {};
    cats.forEach((c) => { parentOf[c.id] = c.parent_id; });
    const topOf = (id) => { let x = id, g = 0; while (parentOf[x] && g++ < 12) x = parentOf[x]; return x; };

    // 2) todos os campos "Marca"/"Fabricante" com suas opções
    const fields = await sql.query(
      `SELECT id, category_id, label, options FROM field_definitions
       WHERE field_type IN ('select','multiselect') AND lower(label) IN ('marca','fabricante')`,
      { type: sql.QueryTypes.SELECT }
    );
    const countOpts = (o) => (Array.isArray(o) ? o.length : 0);

    // 3) maior pool por topo + maior pool global
    const topPool = {};
    let globalPool = [];
    for (const f of fields) {
      const n = countOpts(f.options);
      if (n < THIN) continue;
      const top = topOf(f.category_id);
      if (!topPool[top] || countOpts(topPool[top]) < n) topPool[top] = f.options;
      if (n > globalPool.length) globalPool = f.options;
    }

    // 4) preenche os "magros"
    let filled = 0;
    for (const f of fields) {
      if (countOpts(f.options) >= THIN) continue;
      const top = topOf(f.category_id);
      const pool = (topPool[top] && countOpts(topPool[top]) >= THIN) ? topPool[top] : globalPool;
      if (!pool || pool.length < THIN) continue;
      await sql.query(
        'UPDATE field_definitions SET options = :opts, updated_at = NOW() WHERE id = :id',
        { replacements: { opts: JSON.stringify(pool), id: f.id } }
      );
      filled++;
    }
    // eslint-disable-next-line no-console
    console.log(`[brand-pools-fill] campos Marca preenchidos: ${filled}`);
  },

  async down() {
    // Sem rollback: os pools são marcas reais; reverter recriaria placeholders.
  },
};
