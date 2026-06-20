'use strict';

/** Respostas JSON padronizadas: { success, data, message, meta }. */
function sendOk(res, data = null, message = null, status = 200, meta = undefined) {
  const body = { success: true, data };
  if (message) body.message = message;
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

function sendCreated(res, data = null, message = 'Criado com sucesso') {
  return sendOk(res, data, message, 201);
}

function sendNoContent(res) {
  return res.status(204).send();
}

function paginated(res, rows, { page, limit, total }) {
  return sendOk(res, rows, null, 200, {
    page: Number(page),
    limit: Number(limit),
    total,
    pages: Math.ceil(total / limit) || 1,
  });
}

module.exports = { sendOk, sendCreated, sendNoContent, paginated };
