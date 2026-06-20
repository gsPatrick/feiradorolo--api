# Registo de Migrações

Ordem de criação do schema (parents antes de children para resolver FKs).

| # | Arquivo | Tabela |
|---|---------|--------|
| 1 | `20260101000001-create-users` | users |
| 2 | `20260101000002-create-categories` | categories (auto-FK `parent_id`) |
| 3 | `20260101000003-create-token-blacklist` | token_blacklist |
| 4 | `20260101000004-create-facial-verifications` | facial_verifications |
| 5 | `20260101000005-create-field-definitions` | field_definitions |
| 6 | `20260101000006-create-plans` | plans |
| 7 | `20260101000007-create-products` | products |
| 8 | `20260101000008-create-orders` | orders |
| 9 | `20260101000009-create-order-items` | order_items |
| 10 | `20260101000010-create-payments` | payments |
| 11 | `20260101000011-create-escrow` | escrow |
| 12 | `20260101000012-create-shipments` | shipments |
| 13 | `20260101000013-create-disputes` | disputes |
| 14 | `20260101000014-create-product-highlights` | product_highlights |
| 15 | `20260101000015-create-plan-subscriptions` | plan_subscriptions |
| 16 | `20260101000016-create-chats` | chats |
| 17 | `20260101000017-create-messages` | messages |
| 18 | `20260101000018-create-platform-settings` | platform_settings |
| 19 | `20260101000019-create-security-logs` | security_logs |
| 20 | `20260101000020-create-blocked-words` | blocked_words |
| 21 | `20260101000021-create-user-bans` | user_bans |
| 22 | `20260101000022-create-notifications` | notifications |
| 23 | `20260101000023-create-device-tokens` | device_tokens |

### Engine de Regras Dinâmicas (Módulo Admin)
| # | Arquivo | Tabela / Alteração |
|---|---------|--------------------|
| 24 | `20260101000024-alter-platform-settings-add-engine-fields` | platform_settings (+ default_value, min/max_value, options, unit, is_editable/sensitive/encrypted, sort_order) |
| 25 | `20260101000025-create-commission-rules` | commission_rules |
| 26 | `20260101000026-create-payment-gateway-settings` | payment_gateway_settings |
| 27 | `20260101000027-create-shipping-settings` | shipping_settings |
| 28 | `20260101000028-create-highlight-packages` | highlight_packages |
| 29 | `20260101000029-create-category-pricing` | category_pricing |
| 30 | `20260101000030-create-setting-change-logs` | setting_change_logs |

### Controle Adicional do Admin (regras & conteúdo)
| # | Arquivo | Tabela |
|---|---------|--------|
| 31 | `20260101000031-create-integration-settings` | integration_settings (credenciais Brevo/Zoho/Firebase/Melhor Envio/FCM/OneSignal rotacionáveis) |
| 32 | `20260101000032-create-message-templates` | message_templates (e-mail/push/in-app/sms) |
| 33 | `20260101000033-create-coupons` | coupons |
| 34 | `20260101000034-create-coupon-redemptions` | coupon_redemptions |
| 35 | `20260101000035-create-banners` | banners |

### RBAC Granular
| # | Arquivo | Tabela |
|---|---------|--------|
| 36 | `20260101000036-create-roles` | roles |
| 37 | `20260101000037-create-permissions` | permissions |
| 38 | `20260101000038-create-role-permissions` | role_permissions |
| 39 | `20260101000039-create-user-roles` | user_roles |
| 40 | `20260101000040-create-user-permissions` | user_permissions (overrides allow/deny) |

### Repasse / Split (Mercado Pago)
| # | Arquivo | Tabela |
|---|---------|--------|
| 41 | `20260101000041-create-seller-payment-accounts` | seller_payment_accounts (OAuth do vendedor, tokens cifrados) |

## Seeders
| Arquivo | Conteúdo |
|---------|----------|
| `20260101010001-platform-settings-defaults` | Globais genéricas (escrow.hold_days, provider ativo, manutenção) com default_value. |
| `20260101010002-categories-defaults` | Categorias raiz (Produtos Gerais, Imóveis, Veículos, Serviços, Causa Animal). |
| `20260101010003-commission-rules-defaults` | 10% standard / 12% premium. |
| `20260101010004-highlight-packages-defaults` | Prata 7,99 / Ouro 14,99 / Diamante 21,99 (+ vigência). |
| `20260101010005-shipping-settings-defaults` | Config default de frete (sem markup). |
| `20260101010006-category-pricing-defaults` | Precificação por categoria (package/free/commission). |
| `20260101010007-payment-gateway-settings-defaults` | Mercado Pago test/produção (sem credenciais). |
| `20260101010008-security-settings-defaults` | Verificação facial, login, prazo de disputa, moderação de chat. |
| `20260101010009-message-templates-defaults` | Templates de e-mail/push (order.paid, shipped, chat, disputa, escrow). |
| `20260101010010-rbac-defaults` | Permissões por módulo, papéis (super_admin/admin/finance/moderator/support/seller/user) e mapeamento. |
| `20260101010011-payment-split-settings` | Configs do repasse (split on/off, retenção, release days, binary, descriptor, advanced, OAuth). |
| `20260101010012-super-admin-bootstrap` | Cria o super_admin inicial via .env (ADMIN_EMAIL/PASSWORD/NAME). Idempotente. |
| `20260101010013-app-settings` | Configs de app no banco (public_url, web_url, cors_origins, name, mail.from_*, auth.jwt_expires_in). |

> Ao alterar o schema: criar nova migration (nunca editar uma já aplicada) e
> registrar aqui. Refletir também no model correspondente.
