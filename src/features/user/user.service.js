'use strict';

/**
 * Serviço de usuários: listagem/busca, perfil, RBAC (atribuir/remover papéis),
 * banimentos e verificação facial (KYC) para vendedor e comprador.
 */
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../../models');
const AppError = require('../../utils/AppError');
const validators = require('../../utils/validators');
const permissionService = require('../../services/permission.service');
const receitaws = require('../../providers/receitaws/receitaws.provider');
const settings = require('../../services/settings.cache');
const { onlyDigits, isValidCPF, isValidCNPJ } = require('../../utils/document');

// Sessão de verificação facial (QR): validade do token gerado para o app.
const FACIAL_SESSION_TTL_MS = 10 * 60 * 1000; // 10 min

const PROFILE_FIELDS = [
  'name',
  'email',
  'phone',
  'cpf',
  'cnpj',
  'birth_date',
  'avatar_url',
  'zip_code',
  'street',
  'number',
  'complement',
  'neighborhood',
  'city',
  'state',
  'latitude',
  'longitude',
];

const VERIFICATION_CONTEXTS = ['seller', 'buyer'];

/** Remove campos sensíveis do usuário antes de devolver ao cliente. */
function sanitize(user) {
  if (!user) return user;
  const data = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete data.password_hash;
  return data;
}

async function list({ page = 1, limit = 20, search, status } = {}) {
  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Number(limit) || 20);
  const offset = (pageNum - 1) * limitNum;

  const where = {};
  if (status) where.account_status = status;

  if (search) {
    const term = String(search).trim();
    const digits = validators.onlyDigits(term);
    const or = [
      { name: { [Op.iLike]: `%${term}%` } },
      { email: { [Op.iLike]: `%${term}%` } },
    ];
    if (digits) {
      or.push({ cpf: digits });
      or.push({ cnpj: digits });
    }
    where[Op.or] = or;
  }

  const { rows, count } = await db.User.findAndCountAll({
    where,
    limit: limitNum,
    offset,
    order: [['created_at', 'DESC']],
  });

  return { rows: rows.map(sanitize), total: count };
}

async function getById(id) {
  const user = await db.User.findByPk(id);
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  return sanitize(user);
}

async function updateProfile(userId, data = {}) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const updates = {};
  for (const field of PROFILE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      updates[field] = data[field];
    }
  }
  await user.update(updates);
  return sanitize(user);
}

async function assignRole(userId, roleSlug, assignedBy) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const role = await db.Role.findOne({ where: { slug: roleSlug } });
  if (!role) throw AppError.notFound('Papel não encontrado.');

  const [userRole] = await db.UserRole.findOrCreate({
    where: { user_id: userId, role_id: role.id },
    defaults: { user_id: userId, role_id: role.id, assigned_by: assignedBy || null },
  });
  if (assignedBy && userRole.assigned_by !== assignedBy) {
    userRole.assigned_by = assignedBy;
    await userRole.save();
  }

  permissionService.invalidate(userId);
  return userRole;
}

async function removeRole(userId, roleSlug) {
  const role = await db.Role.findOne({ where: { slug: roleSlug } });
  if (!role) throw AppError.notFound('Papel não encontrado.');

  const removed = await db.UserRole.destroy({ where: { user_id: userId, role_id: role.id } });
  permissionService.invalidate(userId);
  return removed > 0;
}

/**
 * Aplica um banimento.
 * - scope 'full': banimento total → account_status='banned' (middleware HTTP bloqueia tudo).
 * - scopes parciais ('selling'/'buying'/'chat'): NÃO seta account_status='banned'
 *   (senão bloquearia tudo); apenas cria o UserBan ativo e a enforce é feita por
 *   serviço (chat/product) via getActiveBanScopes.
 * - shadowban (type 'shadow' ou shadow:true): não bane — marca users.is_shadowbanned=true.
 */
async function ban(
  userId,
  { reason, type = 'temporary', scope = 'full', expires_at, shadow = false } = {},
  bannedBy
) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const isShadow = shadow === true || type === 'shadow';

  const result = await db.sequelize.transaction(async (transaction) => {
    const record = await db.UserBan.create(
      {
        user_id: userId,
        banned_by: bannedBy || null,
        // O ENUM do UserBan só conhece 'temporary'/'permanent'; um shadowban é
        // persistido como banimento temporário com o sinal em users.is_shadowbanned.
        type: isShadow ? 'temporary' : type,
        scope,
        reason: reason || null,
        starts_at: new Date(),
        expires_at: expires_at || null,
        is_active: true,
      },
      { transaction }
    );

    if (isShadow) {
      // Shadowban: usuário não percebe — não altera account_status.
      await setShadowbanned(userId, true, transaction);
    } else if (scope === 'full') {
      user.account_status = 'banned';
      await user.save({ transaction });
    }
    // Escopos parciais não tocam account_status (enforce por serviço).

    return record;
  });

  return result;
}

async function unban(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  await db.sequelize.transaction(async (transaction) => {
    await db.UserBan.update(
      { is_active: false, lifted_at: new Date() },
      { where: { user_id: userId, is_active: true }, transaction }
    );
    await setShadowbanned(userId, false, transaction);
    user.account_status = 'active';
    await user.save({ transaction });
  });

  return sanitize(user);
}

/* --------------------------- Moderação de contas -------------------------- */

/**
 * Carrega o usuário-alvo garantindo que o ator (admin) não esteja agindo sobre
 * a própria conta e nem sobre outro super-admin (admin_role='admin').
 * Usado por suspend/softDelete (ações destrutivas).
 */
async function loadModerationTarget(userId, actorId) {
  if (actorId && String(actorId) === String(userId)) {
    throw AppError.forbidden('Você não pode aplicar esta ação na própria conta.', 'SELF_ACTION_FORBIDDEN');
  }
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  if (user.admin_role === 'admin') {
    throw AppError.forbidden('Não é permitido moderar outro administrador.', 'PROTECTED_ADMIN');
  }
  return user;
}

/** Aprova uma conta pendente: account_status -> 'active'. */
async function approve(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  user.account_status = 'active';
  await user.save();
  return sanitize(user);
}

/**
 * Suspende uma conta: account_status -> 'suspended'. Guarda reason/until em
 * metadata.suspension (o model não tem colunas dedicadas).
 */
async function suspend(userId, { reason, until } = {}, actorId) {
  const user = await loadModerationTarget(userId, actorId);

  const metadata = { ...(user.metadata || {}) };
  metadata.suspension = {
    reason: reason || null,
    until: until || null,
    suspended_by: actorId || null,
    suspended_at: new Date().toISOString(),
  };
  user.account_status = 'suspended';
  user.metadata = metadata;
  await user.save();
  return sanitize(user);
}

/** Marca/desmarca a restrição "apenas chat" (shadowban) do usuário. */
async function setChatOnly(userId, value) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');
  user.is_shadowbanned = !!value;
  await user.save();
  return sanitize(user);
}

/**
 * Exclui (soft delete) a conta. O model é paranoid → destroy() preenche
 * deleted_at. Também marca account_status='banned' para bloqueio imediato no
 * middleware de auth caso o registro ainda seja carregado (paranoid:false).
 * Bloqueia auto-exclusão e exclusão de outro super-admin.
 */
async function softDelete(userId, actorId) {
  const user = await loadModerationTarget(userId, actorId);

  await db.sequelize.transaction(async (transaction) => {
    user.account_status = 'banned';
    await user.save({ transaction });
    await user.destroy({ transaction }); // paranoid → deleted_at
  });

  return sanitize(user);
}

/* -------------------------------- bulk admin ----------------------------- */

const BULK_MAX = 200;

/**
 * Aplica `fn(id)` para cada id isolando erros por item (try/catch). Não para no
 * primeiro erro. Retorna { ok: <nº sucessos>, failed: [{ id, error }] }.
 */
async function bulkApply(ids, fn) {
  if (!Array.isArray(ids) || ids.length === 0) {
    throw AppError.unprocessable('ids deve ser um array não vazio.', 'BULK_IDS_REQUIRED');
  }
  if (ids.length > BULK_MAX) {
    throw AppError.unprocessable(`Máximo de ${BULK_MAX} itens por lote.`, 'BULK_TOO_MANY');
  }
  let ok = 0;
  const failed = [];
  for (const id of ids) {
    try {
      await fn(id);
      ok += 1;
    } catch (err) {
      failed.push({ id, error: err && err.message ? err.message : String(err) });
    }
  }
  return { ok, failed };
}

/**
 * Ações em massa de usuários (admin). Reaproveita os services existentes,
 * isolando erros por id. As proteções (auto-ação e super-admin) já existem nos
 * services destrutivos (suspend/softDelete via loadModerationTarget); aqui
 * também barramos auto-ação para QUALQUER ação (o erro vira item em `failed`,
 * sem derrubar o lote).
 * action ∈ approve|suspend|ban|unban|delete|chat_only|remove_chat_only.
 */
async function bulkAdmin({ ids, action, payload } = {}, actorId) {
  const handlers = {
    approve: (id) => approve(id),
    suspend: (id) => suspend(id, payload || {}, actorId),
    ban: (id) => ban(id, payload || {}, actorId),
    unban: (id) => unban(id),
    delete: (id) => softDelete(id, actorId),
    chat_only: (id) => setChatOnly(id, true),
    remove_chat_only: (id) => setChatOnly(id, false),
  };
  const fn = handlers[action];
  if (!fn) {
    throw AppError.unprocessable(
      `action inválida. Valores: ${Object.keys(handlers).join(', ')}.`,
      'INVALID_BULK_ACTION'
    );
  }
  return bulkApply(ids, (id) => {
    // Proteção uniforme: nunca aplicar a ação na própria conta do ator.
    if (actorId && String(actorId) === String(id)) {
      throw AppError.forbidden(
        'Você não pode aplicar esta ação na própria conta.',
        'SELF_ACTION_FORBIDDEN'
      );
    }
    return fn(id);
  });
}

/* ----------------------------- Ban scopes / shadow ------------------------ */

/**
 * Retorna os escopos de banimento ATIVOS de um usuário (is_active e não expirados).
 * @returns {Promise<string[]>} ex.: ['chat', 'selling']
 */
async function getActiveBanScopes(userId) {
  const now = new Date();
  const bans = await db.UserBan.findAll({
    where: {
      user_id: userId,
      is_active: true,
      [Op.or]: [{ expires_at: null }, { expires_at: { [Op.gt]: now } }],
    },
    attributes: ['scope'],
  });
  return [...new Set(bans.map((b) => b.scope))];
}

/**
 * Lê o flag users.is_shadowbanned via SQL cru (a coluna existe por migration,
 * mas não é declarada no model User — evita depender da edição do model).
 */
async function isShadowbanned(userId) {
  const [rows] = await db.sequelize.query(
    'SELECT is_shadowbanned FROM users WHERE id = :id LIMIT 1',
    { replacements: { id: userId } }
  );
  return !!(rows && rows[0] && rows[0].is_shadowbanned);
}

/** Define users.is_shadowbanned via SQL cru (coluna não declarada no model). */
async function setShadowbanned(userId, value, transaction) {
  await db.sequelize.query(
    'UPDATE users SET is_shadowbanned = :value, updated_at = NOW() WHERE id = :id',
    { replacements: { id: userId, value: !!value }, transaction }
  );
}

/* --------------------- Validação de documento (ReceitaWS) ----------------- */

/**
 * Valida o documento do vendedor.
 * - person_type 'company' (tem CNPJ): consulta a ReceitaWS. Se a consulta funcionar
 *   e situação !== 'ATIVA', lança CNPJ_INACTIVE. Se ATIVA, registra o resultado em
 *   metadata.document_validation. Falha de rede/rate-limit não invalida o cadastro.
 * - person_type 'individual' (CPF): a ReceitaWS gratuita NÃO cobre CPF, então
 *   fazemos apenas validação sintática (dígitos verificadores) local.
 *
 * Complementar à verificação facial (KYC) existente — não a substitui.
 */
async function validateSellerDocument(userId) {
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  if (user.person_type === 'company') {
    if (!user.cnpj) {
      throw AppError.unprocessable('Usuário PJ sem CNPJ cadastrado.', 'CNPJ_MISSING');
    }
    if (!validators.isCNPJ(user.cnpj)) {
      throw AppError.unprocessable('CNPJ inválido.', 'CNPJ_INVALID');
    }

    const lookup = await receitaws.lookupCnpj(user.cnpj);
    if (!lookup.ok) {
      // ReceitaWS indisponível/rate-limit: não invalida o cadastro, só informa.
      return {
        document: 'cnpj',
        validated: false,
        skipped: true,
        reason: lookup.error,
      };
    }
    if (lookup.situacao !== 'ATIVA') {
      throw AppError.unprocessable('CNPJ não está ativo na Receita.', 'CNPJ_INACTIVE');
    }

    const metadata = { ...(user.metadata || {}) };
    metadata.document_validation = {
      document: 'cnpj',
      situacao: lookup.situacao,
      nome: lookup.nome || null,
      validated_at: new Date().toISOString(),
    };
    await user.update({ metadata });

    return { document: 'cnpj', validated: true, situacao: lookup.situacao, nome: lookup.nome || null };
  }

  // person_type 'individual' → CPF (somente validação sintática local).
  if (!user.cpf) {
    throw AppError.unprocessable('Usuário PF sem CPF cadastrado.', 'CPF_MISSING');
  }
  if (!validators.isCPF(user.cpf)) {
    throw AppError.unprocessable('CPF inválido.', 'CPF_INVALID');
  }
  return { document: 'cpf', validated: true, note: 'CPF validado sintaticamente (Receita não cobre CPF).' };
}

/* ------------------------------- KYC / facial ----------------------------- */

/**
 * Submete a verificação (KYC) do vendedor/comprador.
 *
 * Compatível com a chamada antiga `{ context, selfie_url, document_url }` e
 * estendido para o passo 3 do wizard de vendedor (Shopee-like), que envia os
 * dados de identificação fiscal + documentos:
 *   { context:'seller', person_type:'PF'|'PJ', full_name, nationality,
 *     document, birth_date, document_front_url, document_back_url }
 *
 * Todos os campos novos são OPCIONAIS — valida apenas o que vier:
 * - full_name → User.name (apenas se ainda vazio).
 * - person_type 'PF'/'PJ' (ou 'individual'/'company') → User.person_type.
 * - document → cpf/cnpj conforme person_type (validado por isValidCPF/isValidCNPJ;
 *   documento inválido derruba com AppError claro).
 * - birth_date → User.birth_date.
 * - nationality + URLs dos documentos → User.metadata.kyc (auditoria).
 * Cria/atualiza um FacialVerification (status 'pending') com os documentos e
 * marca seller/buyer_verification_status = 'pending' (em revisão).
 */
async function submitVerification(userId, data = {}) {
  const {
    context,
    selfie_url,
    document_url,
    person_type,
    full_name,
    nationality,
    document,
    birth_date,
    document_front_url,
    document_back_url,
  } = data;

  if (!VERIFICATION_CONTEXTS.includes(context)) {
    throw AppError.unprocessable("context deve ser 'seller' ou 'buyer'.", 'INVALID_CONTEXT');
  }
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  // Normaliza person_type aceitando os rótulos do wizard (PF/PJ) e os do model.
  let normalizedPersonType = null;
  if (person_type != null && person_type !== '') {
    const pt = String(person_type).trim().toUpperCase();
    if (pt === 'PF' || pt === 'INDIVIDUAL') normalizedPersonType = 'individual';
    else if (pt === 'PJ' || pt === 'COMPANY') normalizedPersonType = 'company';
    else {
      throw AppError.unprocessable(
        "person_type deve ser 'PF'/'PJ' (ou 'individual'/'company').",
        'INVALID_PERSON_TYPE'
      );
    }
  }

  // Tipo efetivo para validar o documento: o enviado, senão o atual do usuário.
  const effectivePersonType = normalizedPersonType || user.person_type || 'individual';

  // Documento (CPF/CNPJ): valida conforme o person_type efetivo.
  let documentDigits = null;
  if (document != null && document !== '') {
    documentDigits = onlyDigits(document);
    if (effectivePersonType === 'company') {
      if (!isValidCNPJ(documentDigits)) {
        throw AppError.unprocessable('CNPJ inválido.', 'INVALID_CNPJ');
      }
    } else if (!isValidCPF(documentDigits)) {
      throw AppError.unprocessable('CPF inválido.', 'INVALID_CPF');
    }
  }

  const userUpdates = {};
  if (normalizedPersonType) userUpdates.person_type = normalizedPersonType;
  if (full_name && !String(user.name || '').trim()) {
    userUpdates.name = String(full_name).trim();
  }
  if (documentDigits) {
    if (effectivePersonType === 'company') userUpdates.cnpj = documentDigits;
    else userUpdates.cpf = documentDigits;
  }
  if (birth_date) userUpdates.birth_date = birth_date;

  // nationality + URLs dos documentos ficam em metadata.kyc (auditoria/revisão).
  const kyc = { ...((user.metadata && user.metadata.kyc) || {}) };
  if (nationality != null && nationality !== '') kyc.nationality = nationality;
  if (full_name) kyc.full_name = String(full_name).trim();
  if (document_front_url) kyc.document_front_url = document_front_url;
  if (document_back_url) kyc.document_back_url = document_back_url;
  kyc.submitted_at = new Date().toISOString();

  const record = await db.sequelize.transaction(async (transaction) => {
    // Documento principal exibido na revisão: front, senão o legado document_url.
    const created = await db.FacialVerification.create(
      {
        user_id: userId,
        context,
        status: 'pending',
        selfie_url: selfie_url || null,
        document_url: document_url || document_front_url || null,
        metadata: {
          person_type: effectivePersonType,
          document_front_url: document_front_url || null,
          document_back_url: document_back_url || null,
          nationality: nationality || null,
        },
      },
      { transaction }
    );

    Object.assign(userUpdates, {
      metadata: { ...(user.metadata || {}), kyc },
    });
    userUpdates[`${context}_verification_status`] = 'pending';
    await user.update(userUpdates, { transaction });
    return created;
  });

  return record;
}

/* ---------------------- Sessão de verificação facial (QR) ------------------ */

/** Monta a URL pública de captura facial a partir das configs do app. */
async function facialCaptureUrl(token) {
  const base =
    (await settings.get('app.web_url', '')) ||
    (await settings.get('app.public_url', '')) ||
    'http://localhost:3000';
  return `${String(base).replace(/\/+$/, '')}/verificacao-facial?token=${token}`;
}

/**
 * Cria uma sessão de verificação facial (QR). Gera um token UUID com validade
 * de 10 min e a URL pública que o app abrirá para a captura. A captura facial
 * real fica a cargo do app — aqui apenas emitimos a sessão.
 *
 * O token/expiry são persistidos num FacialVerification em andamento
 * (provider='facial-session', external_reference=token, expiry em metadata).
 */
async function createFacialSession(userId, { context = 'seller' } = {}) {
  if (!VERIFICATION_CONTEXTS.includes(context)) {
    throw AppError.unprocessable("context deve ser 'seller' ou 'buyer'.", 'INVALID_CONTEXT');
  }
  const user = await db.User.findByPk(userId);
  if (!user) throw AppError.notFound('Usuário não encontrado.');

  const token = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + FACIAL_SESSION_TTL_MS);

  await db.FacialVerification.create({
    user_id: userId,
    context,
    status: 'pending',
    provider: 'facial-session',
    external_reference: token,
    metadata: { session: { token, expires_at: expiresAt.toISOString() } },
  });

  const url = await facialCaptureUrl(token);
  return { token, url, expires_at: expiresAt.toISOString() };
}

/**
 * Consulta o status de uma sessão facial pelo token:
 * 'pending' | 'expired' (e o status do registro, caso já revisado).
 */
async function getFacialSession(userId, token) {
  if (!token) throw AppError.unprocessable('token é obrigatório.', 'TOKEN_REQUIRED');
  const record = await db.FacialVerification.findOne({
    where: { user_id: userId, provider: 'facial-session', external_reference: token },
    order: [['created_at', 'DESC']],
  });
  if (!record) throw AppError.notFound('Sessão de verificação não encontrada.', 'SESSION_NOT_FOUND');

  const expiresAt =
    record.metadata && record.metadata.session ? record.metadata.session.expires_at : null;
  const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;

  return {
    token,
    status: expired && record.status === 'pending' ? 'expired' : record.status,
    expires_at: expiresAt,
  };
}

async function reviewVerification(verificationId, { status, rejection_reason } = {}, reviewerId) {
  if (!['approved', 'rejected'].includes(status)) {
    throw AppError.unprocessable("status deve ser 'approved' ou 'rejected'.", 'INVALID_STATUS');
  }
  const record = await db.FacialVerification.findByPk(verificationId);
  if (!record) throw AppError.notFound('Verificação não encontrada.');

  const result = await db.sequelize.transaction(async (transaction) => {
    record.status = status;
    record.rejection_reason = status === 'rejected' ? rejection_reason || null : null;
    record.reviewed_by = reviewerId || null;
    record.reviewed_at = new Date();
    await record.save({ transaction });

    const user = await db.User.findByPk(record.user_id, { transaction });
    if (user) {
      user[`${record.context}_verification_status`] = status === 'approved' ? 'verified' : 'rejected';
      await user.save({ transaction });
    }
    return record;
  });

  // KYC: comprador aprovado → libera os pedidos que estavam retidos e avisa os vendedores.
  if (status === 'approved' && result.context === 'buyer') {
    const held = await db.Order.findAll({
      where: { buyer_id: result.user_id, held_for_buyer_verification: true },
    });
    if (held.length) {
      const notify = require('../notification/notification.service');
      for (const order of held) {
        await order.update({ held_for_buyer_verification: false });
        notify
          .notifyUser(order.seller_id, {
            type: 'order.released',
            channel: 'in_app',
            title: 'Pedido liberado',
            body: `O comprador concluiu a verificação facial. O pedido ${order.order_number} foi liberado para envio.`,
          })
          .catch(() => {});
      }
    }
  }

  return result;
}

async function myVerifications(userId) {
  return db.FacialVerification.findAll({
    where: { user_id: userId },
    order: [['created_at', 'DESC']],
  });
}

module.exports = {
  list,
  getById,
  updateProfile,
  assignRole,
  removeRole,
  ban,
  unban,
  approve,
  suspend,
  setChatOnly,
  softDelete,
  bulkAdmin,
  bulkApply,
  getActiveBanScopes,
  isShadowbanned,
  validateSellerDocument,
  submitVerification,
  createFacialSession,
  getFacialSession,
  reviewVerification,
  myVerifications,
  sanitize,
};
