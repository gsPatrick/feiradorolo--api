'use strict';

// Constantes de domínio centralizadas. Os VALORES financeiros aqui são apenas
// defaults de bootstrap (seed). Em runtime a fonte da verdade é a tabela
// `platform_settings` (aba Receitas do painel admin).

const PERSON_TYPES = ['individual', 'company'];

const SELLER_TIERS = ['standard', 'premium'];

const HIGHLIGHT_TIERS = ['none', 'silver', 'gold', 'diamond'];

// Modelos de monetização por categoria (ver regras/3_regras_de_negocio.md).
const MONETIZATION_MODELS = ['commission', 'package', 'free', 'free_geo'];

const VERIFICATION_STATUS = ['not_required', 'pending', 'verified', 'rejected'];

const ACCOUNT_STATUS = ['active', 'pending', 'suspended', 'banned'];

// Defaults de bootstrap — sobrescritos por platform_settings em runtime.
const DEFAULTS = {
  commission: { standard: 10.0, premium: 12.0 }, // %
  highlight: { none: 0.0, silver: 7.99, gold: 14.99, diamond: 21.99 }, // BRL
  escrow: { holdDays: 7 },
  currency: 'BRL',
};

module.exports = {
  PERSON_TYPES,
  SELLER_TIERS,
  HIGHLIGHT_TIERS,
  MONETIZATION_MODELS,
  VERIFICATION_STATUS,
  ACCOUNT_STATUS,
  DEFAULTS,
};
