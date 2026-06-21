# Templates de e-mail — Feira do Rolo

E-mails transacionais enviados via **Resend**. Cada template é renderizado
substituindo os placeholders `{{var}}` pelos valores reais no momento do envio.

## Estrutura

- `templates/<key>.html` — versão **oficial**, com placeholders dinâmicos `{{var}}`.
- `previews/<key>.html` — mesmo template com **dados fixos** realistas; abra no
  navegador para conferir o visual.
- `subjects.js` — exporta `{ <key>: 'Assunto com {{var}}' }`.
- O seeder `seeders/20260102000010-email-templates.js` lê `templates/*.html` +
  `subjects.js` e faz upsert idempotente (por `key`) em `message_templates`.

## Identidade visual

- Acento amarelo `#FFD700` com texto escuro `#0f172a` por cima.
- Fundo `#f6f7f9`, cartão branco, cantos arredondados, largura ~600px.
- HTML email-safe: layout em tabelas, CSS inline, sem flexbox/grid.

## Templates

| key | Assunto | Variáveis |
| --- | --- | --- |
| `verificacao-email` | Confirme seu e-mail — Feira do Rolo | `name`, `code`, `verify_url` |
| `boas-vindas` | Bem-vindo à Feira do Rolo, {{name}}! 🎉 | `name`, `cta_url` |
| `recuperar-senha` | Redefina sua senha — Feira do Rolo | `name`, `reset_url` |
| `pedido-confirmado` | Pedido #{{order_number}} confirmado | `name`, `order_number`, `total`, `order_url` |
| `pagamento-aprovado` | Pagamento aprovado — Pedido #{{order_number}} | `name`, `order_number`, `total`, `order_url` |
| `pedido-enviado` | Seu pedido #{{order_number}} foi enviado 🚚 | `name`, `order_number`, `carrier`, `tracking_code`, `tracking_url` |
| `codigo-retirada` | Seu código de retirada — Feira do Rolo | `name`, `code`, `product`, `order_number` |
| `nova-venda` | Você vendeu! Pedido #{{order_number}} 💰 | `seller_name`, `order_number`, `total`, `buyer_name`, `order_url` |

### Detalhes por template

1. **verificacao-email** — Confirmação de e-mail na criação de conta. Código de
   6 dígitos em destaque + botão "Confirmar e-mail". O código expira em 15 min.
2. **boas-vindas** — Saudação após ativar a conta + botão "Começar a comprar".
3. **recuperar-senha** — Link de redefinição (botão "Redefinir senha"), aviso de
   expiração e "se não foi você, ignore".
4. **pedido-confirmado** — Confirmação de registro do pedido com total e botão
   "Ver pedido".
5. **pagamento-aprovado** — Tom positivo: pagamento confirmado, vendedor avisado.
6. **pedido-enviado** — Transportadora + código de rastreio e botão "Rastrear".
7. **codigo-retirada** — Código de 6 dígitos para retirada presencial. Avisa para
   informar o código SÓ ao receber o produto e encontrar-se em local público.
8. **nova-venda** — Aviso ao vendedor de nova venda + botão "Ver venda / Gerar
   etiqueta".
