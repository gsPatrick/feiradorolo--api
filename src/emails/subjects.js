'use strict';

/**
 * Assuntos (subject) de cada template de e-mail transacional da Feira do Rolo.
 * A chave (key) casa com o arquivo em `templates/<key>.html` e com a coluna
 * `key` da tabela `message_templates`. Placeholders no formato {{var}} são
 * substituídos no envio (Resend).
 */
module.exports = {
  'verificacao-email': 'Confirme seu e-mail — Feira do Rolo',
  'boas-vindas': 'Bem-vindo à Feira do Rolo, {{name}}! 🎉',
  'recuperar-senha': 'Redefina sua senha — Feira do Rolo',
  'pedido-confirmado': 'Pedido #{{order_number}} confirmado',
  'pagamento-aprovado': 'Pagamento aprovado — Pedido #{{order_number}}',
  'pedido-enviado': 'Seu pedido #{{order_number}} foi enviado 🚚',
  'codigo-retirada': 'Seu código de retirada — Feira do Rolo',
  'nova-venda': 'Você vendeu! Pedido #{{order_number}} 💰',
};
