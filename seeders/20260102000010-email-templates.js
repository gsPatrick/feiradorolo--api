'use strict';

/**
 * Templates de e-mail transacional da Feira do Rolo (Resend).
 *
 * Lê os arquivos HTML oficiais em `src/emails/templates/*.html` e os assuntos
 * em `src/emails/subjects.js`, e faz upsert idempotente em `message_templates`
 * (delete-then-insert por `key` no canal `email` / locale `pt-BR`).
 *
 * As variáveis ({{var}}) de cada template são extraídas automaticamente do
 * HTML + do assunto.
 */
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

const EMAILS_DIR = path.join(__dirname, '..', 'src', 'emails');
const TEMPLATES_DIR = path.join(EMAILS_DIR, 'templates');
const subjects = require(path.join(EMAILS_DIR, 'subjects.js'));

// Nome amigável (PT) de cada template.
const NAMES = {
  'verificacao-email': 'Verificação de e-mail',
  'boas-vindas': 'Boas-vindas',
  'recuperar-senha': 'Recuperar senha',
  'pedido-confirmado': 'Pedido confirmado',
  'pagamento-aprovado': 'Pagamento aprovado',
  'pedido-enviado': 'Pedido enviado',
  'codigo-retirada': 'Código de retirada',
  'nova-venda': 'Nova venda',
};

const LOCALE = 'pt-BR';
const CHANNEL = 'email';

/** Extrai nomes únicos de placeholders {{var}} preservando ordem de aparição. */
function extractVariables(...sources) {
  const found = [];
  const seen = new Set();
  for (const src of sources) {
    const matches = String(src || '').match(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g) || [];
    for (const m of matches) {
      const name = m.replace(/\{\{\s*|\s*\}\}/g, '');
      if (!seen.has(name)) {
        seen.add(name);
        found.push(name);
      }
    }
  }
  return found;
}

function buildRows() {
  return Object.keys(subjects).map((key) => {
    const body = fs.readFileSync(path.join(TEMPLATES_DIR, `${key}.html`), 'utf8');
    const subject = subjects[key];
    return {
      key,
      name: NAMES[key] || key,
      subject,
      body,
      variables: extractVariables(body, subject),
    };
  });
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const rows = buildRows();
    const keys = rows.map((r) => r.key);

    // Idempotente: remove versões existentes destes templates (mesmo canal/locale)
    // e reinsere a partir dos arquivos atuais.
    await queryInterface.bulkDelete('message_templates', {
      key: { [Sequelize.Op.in]: keys },
      channel: CHANNEL,
      locale: LOCALE,
    });

    await queryInterface.bulkInsert(
      'message_templates',
      rows.map((r) => ({
        id: randomUUID(),
        key: r.key,
        channel: CHANNEL,
        locale: LOCALE,
        name: r.name,
        subject: r.subject,
        title: null,
        body: r.body,
        variables: JSON.stringify(r.variables),
        is_transactional: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('message_templates', {
      key: { [Sequelize.Op.in]: Object.keys(subjects) },
      channel: CHANNEL,
      locale: LOCALE,
    });
  },
};
