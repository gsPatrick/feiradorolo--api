'use strict';

// Verificação facial desligada por enquanto — mude para true para reativar o nível 3 (Máximo).
const FACIAL_ENABLED = false;

/**
 * Nível de verificação 0–3 do usuário/vendedor, a partir dos campos reais do User.
 * Regra única, centralizada (usada em product.service e verification.service):
 *
 *   0 = nada;
 *   1 = e-mail OU telefone verificado (email_verified_at / phone_verified_at);
 *   2 = documento validado (document_verified_at preenchido — CPF math p/ PF,
 *       CNPJ via ReceitaWS p/ PJ);
 *   3 = verificação facial aprovada (seller_verification_status === 'verified').
 *
 * Os níveis são acumulativos: o nível 3 (facial) sobrepõe os demais; o nível 2
 * (documento) sobrepõe o 1; etc. Aceita tanto instância Sequelize quanto objeto
 * cru (lê via getDataValue quando disponível).
 *
 * IMPORTANTE: o nível 3 (facial) está atrás da flag FACIAL_ENABLED (acima).
 * Enquanto ela for false, o nível MÁXIMO alcançável é 2 (documento) — mesmo que
 * o seller tenha facial 'verified'. Para reativar, mude FACIAL_ENABLED para true.
 */
function field(user, name) {
  if (!user) return undefined;
  if (typeof user.getDataValue === 'function') {
    const v = user.getDataValue(name);
    if (v !== undefined) return v;
  }
  return user[name];
}

function computeVerificationLevel(user) {
  if (!user) return 0;
  if (FACIAL_ENABLED && field(user, 'seller_verification_status') === 'verified') return 3;
  if (field(user, 'document_verified_at')) return 2;
  if (field(user, 'email_verified_at') || field(user, 'phone_verified_at')) return 1;
  return 0;
}

function trustLabel(level) {
  switch (level) {
    case 1: return 'Básico';
    case 2: return 'Confiável';
    case 3: return 'Máximo';
    default: return 'Não verificado';
  }
}

module.exports = { computeVerificationLevel, trustLabel, FACIAL_ENABLED };
