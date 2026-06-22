'use strict';

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
  if (field(user, 'seller_verification_status') === 'verified') return 3;
  if (field(user, 'document_verified_at')) return 2;
  if (field(user, 'email_verified_at') || field(user, 'phone_verified_at')) return 1;
  return 0;
}

module.exports = { computeVerificationLevel };
