# Modelagem de Dados — Feira do Rolo

Resumo conceitual das **23 tabelas** (Sequelize + PostgreSQL). PK = UUID;
`underscored` (snake_case); `timestamps` (created_at/updated_at); soft delete
em `users` e `products` (deleted_at).

## Identidade & Segurança
- **users** — compradores e vendedores (papéis coexistem). CPF e CNPJ
  **separados** por `person_type`. Flags de verificação facial
  (`seller_verification_status`/`buyer_verification_status` + gatilhos
  `has_first_sale`/`has_first_purchase`). `seller_tier` (standard/premium) define
  a comissão. Geolocalização e endereço inclusos.
- **token_blacklist** — JWT revogados (logout), com `expires_at` para limpeza.
- **facial_verifications** — histórico KYC; `context` = seller|buyer.
- **security_logs** — auditoria (aba Auditoria).
- **blocked_words** — termos bloqueados (aba Segurança); regex + ação (flag/block/mask).
- **user_bans** — banimentos temporários/permanentes, por escopo.

## Catálogo
- **categories** — `monetization_model`: commission | package | free | free_geo;
  `requires_geolocation` (Causa Animal); subcategorias via `parent_id`.
- **field_definitions** — especificações dinâmicas por categoria (aba Especificações).
- **plans** — pacotes (Imóveis/Veículos), premium do vendedor, upgrade de Serviços.
- **products** — anúncios; `specifications`/`variations`/`images` em JSONB;
  `highlight_tier` (none/silver/gold/diamond); geolocalização; dados de frete.
- **product_highlights** — histórico de compras do upsell de destaque.
- **plan_subscriptions** — compras/assinaturas de planos.

## Checkout, Pagamento & Logística
- **orders** — pedido por vendedor; snapshot de comissão
  (`commission_rate`/`commission_amount`/`seller_amount`).
- **order_items** — itens com snapshot de título/preço.
- **payments** — Mercado Pago; split (`platform_fee`/`gateway_fee`/`net_amount`);
  `purpose` = order|plan|highlight; `split` (JSONB) = modo/estratégia de repasse.
- **seller_payment_accounts** — vínculo OAuth do vendedor (Mercado Pago Connect):
  `access_token`/`refresh_token` cifrados, `mp_user_id` (collector), `expires_at`
  (refresh automático). Usado para o split/repasse nativo.
- **escrow** — custódia de 7 dias (`release_due_at`); bloqueado por disputa.
- **shipments** — Melhor Envio; etiqueta, rastreio, custo, endereços.
- **disputes** — disputas de pedido (aba Pedidos → conectar disputas).

## Comunicação
- **chats** — conversa comprador↔vendedor (vinculável a produto/pedido); `is_flagged`.
- **messages** — mensagens; `moderation_status` + `contains_blocked_words`.

## Plataforma / Admin
- **platform_settings** — engine genérica chave/valor (JSONB) com `default_value`
  (restaurar padrões), `min_value`/`max_value`/`options` (validação severa) e
  flags `is_editable`/`is_sensitive`/`is_encrypted`.
- **notifications** — push/in-app/e-mail; `provider` (fcm/onesignal/internal).
- **device_tokens** — tokens de push por dispositivo (FCM/OneSignal).

## Engine de Regras Dinâmicas (nada hardcoded)
Tabelas tipadas e validadas, consultadas pelos cálculos do marketplace (split,
escrow, frete, taxas). Apenas admins editam; mudanças auditadas em
`setting_change_logs`. Recomenda-se cache em memória no service de config.
- **commission_rules** — comissão/split por escopo (global/categoria/tier) com
  `commission_percent` (0–100) e `escrow_hold_days` opcional. Resolução por `priority`.
- **payment_gateway_settings** — credenciais do gateway rotacionáveis pelo admin;
  segredos em colunas `*_encrypted` (cifrados na camada de service), `key_version`,
  `environment` (test/production), 1 linha por (provider, environment).
- **shipping_settings** — `markup_percent`/`markup_fixed`, frete grátis
  (habilitação + mínimo + categorias) e limites operacionais (peso/valor/dimensões).
- **highlight_packages** — preço e vigência (`duration_days`) de Prata/Ouro/Diamante.
- **category_pricing** — modelo de cobrança e taxa de publicação por categoria
  (free/commission/flat_fee/package; `requires_plan` p/ Imóveis/Veículos).
- **setting_change_logs** — auditoria de alterações de config (old/new value,
  `changed_by`, ação inclui `restore_default`).

## RBAC Granular (controle de acesso do admin)
Permissões atômicas + papéis + overrides por usuário. Resolução de acesso:
permissões dos papéis do usuário **∪** overrides `allow`, **menos** overrides
`deny` (deny vence). Papéis/permissões `is_system` são protegidos.
- **roles** — papéis (super_admin, admin, finance, moderator, support, seller,
  user) com `level` de hierarquia.
- **permissions** — `module.action` (ex.: `orders.view`, `revenue.manage`),
  cobrindo as 11 abas + engine (coupons/banners/integrations/rbac/settings).
- **role_permissions** — N:N papel↔permissão.
- **user_roles** — papéis do usuário (`assigned_by`, `expires_at` p/ temporário).
- **user_permissions** — overrides diretos `allow`/`deny` por usuário (`expires_at`).

> Os campos legados `users.is_admin`/`users.admin_role` permanecem por compat,
> mas o RBAC é a fonte da verdade de autorização.

> **Fontes da verdade:** comissões → `commission_rules`; destaques →
> `highlight_packages`; frete → `shipping_settings`; gateway →
> `payment_gateway_settings`; taxas de categoria → `category_pricing`.
> `platform_settings` cobre globais transversais (ex.: `escrow.hold_days` default).

## Mapa de Relacionamentos
```
users 1─N products · orders(buyer) · orders(seller) · payments · facial_verifications
      1─N plan_subscriptions · notifications · device_tokens · user_bans · security_logs
categories 1─N categories(children) · field_definitions · products · plans
products 1─N order_items · product_highlights · chats
orders 1─N order_items · payments · shipments · disputes · chats   |  1─1 escrow
payments 1─1 escrow   ·   plans 1─N plan_subscriptions
chats 1─N messages
```

## Decisões-chave
1. **CPF/CNPJ separados** e únicos, governados por `person_type`.
2. **platform_settings** centraliza valores que eram hard-coded (comissões/destaques/frete).
3. **Snapshots financeiros** em orders/order_items para auditoria imutável.
4. **JSONB** para campos dinâmicos: specifications, variations, images, split, payload, address.
5. **escrow** com `release_due_at` (held_at + 7d) e bloqueio por disputa aberta.
6. **Soft delete** em users/products para preservar histórico de pedidos/chat.
