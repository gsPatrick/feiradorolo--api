'use strict';

/**
 * Templates default de e-mail/push por evento (admin pode editar). Placeholders
 * entre {{ }} declarados em `variables`.
 */
const { randomUUID } = require('crypto');

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const rows = [
      {
        key: 'order.paid', channel: 'email', name: 'Pedido pago', provider: 'brevo',
        subject: 'Seu pedido {{order_number}} foi confirmado',
        body: 'Olá {{buyer_name}}, recebemos o pagamento do pedido {{order_number}} no valor de {{total}}. Obrigado!',
        variables: ['buyer_name', 'order_number', 'total'],
      },
      {
        key: 'order.paid', channel: 'push', name: 'Pedido pago (push)', provider: 'fcm',
        title: 'Pagamento confirmado', body: 'Seu pedido {{order_number}} foi confirmado.',
        variables: ['order_number'],
      },
      {
        key: 'order.shipped', channel: 'email', name: 'Pedido enviado', provider: 'brevo',
        subject: 'Seu pedido {{order_number}} foi enviado',
        body: 'Olá {{buyer_name}}, seu pedido saiu para entrega. Rastreio: {{tracking_code}}.',
        variables: ['buyer_name', 'order_number', 'tracking_code'],
      },
      {
        key: 'chat.new_message', channel: 'push', name: 'Nova mensagem (push)', provider: 'fcm',
        title: 'Nova mensagem', body: 'Você recebeu uma mensagem de {{sender_name}}.',
        variables: ['sender_name'],
      },
      {
        key: 'dispute.opened', channel: 'email', name: 'Disputa aberta', provider: 'brevo',
        subject: 'Disputa aberta no pedido {{order_number}}',
        body: 'Uma disputa foi aberta no pedido {{order_number}}. Nossa equipe irá analisar.',
        variables: ['order_number'],
      },
      {
        key: 'escrow.released', channel: 'email', name: 'Valor liberado ao vendedor', provider: 'brevo',
        subject: 'Pagamento liberado — pedido {{order_number}}',
        body: 'Olá {{seller_name}}, o valor de {{amount}} do pedido {{order_number}} foi liberado.',
        variables: ['seller_name', 'order_number', 'amount'],
      },
    ];

    await queryInterface.bulkInsert(
      'message_templates',
      rows.map((r) => ({
        id: randomUUID(),
        key: r.key,
        channel: r.channel,
        locale: 'pt-BR',
        name: r.name,
        subject: r.subject || null,
        title: r.title || null,
        body: r.body,
        variables: JSON.stringify(r.variables),
        provider: r.provider,
        is_transactional: true,
        is_active: true,
        created_at: now,
        updated_at: now,
      }))
    );
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.bulkDelete('message_templates', {
      key: {
        [Sequelize.Op.in]: ['order.paid', 'order.shipped', 'chat.new_message', 'dispute.opened', 'escrow.released'],
      },
    });
  },
};
