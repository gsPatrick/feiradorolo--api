# Mapa de Rotas da API (`/api/v1`)

Fluxo: **Routes → Controller → Service → (Provider)**. Auth via `Bearer <JWT>`.
Autorização por RBAC granular (`authorize('module.action')`).

> Probes: `GET /health` · `GET /api/v1/ping`

## auth — `/auth`
| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| POST | `/register` | público | Cadastro (valida e-mail + CPF/CNPJ separados) |
| POST | `/login` | público | Login por e-mail/senha |
| POST | `/social` | público | Login social (Firebase ID token) |
| POST | `/logout` | sim | Revoga o token (token_blacklist) |
| GET | `/me` | sim | Usuário atual + papéis |

## user — `/users`
| Método | Rota | Permissão |
|--------|------|-----------|
| GET | `/` | `users.view` |
| GET | `/:id` | `users.view` |
| PATCH | `/me` | (auth) |
| POST | `/:id/roles` · DELETE `/:id/roles/:slug` | `rbac.manage` |
| POST | `/:id/ban` · `/:id/unban` | `users.ban` |
| POST | `/me/verification` · GET `/me/verification` | (auth) — KYC facial |
| PATCH | `/verification/:id/review` | `users.verify` |

## admin (engine dinâmica) — `/admin`
| Recurso | Rotas | Permissão |
|---------|-------|-----------|
| platform_settings | `GET /settings`, `GET/PUT /settings/:key`, `POST /settings/:key/restore` | `settings.view`/`settings.manage` |
| commission_rules | `GET/POST /commission-rules`, `PUT/DELETE /commission-rules/:id` | `revenue.*` |
| highlight_packages | `/highlight-packages` CRUD | `revenue.*` |
| category_pricing | `/category-pricing` CRUD | `revenue.*` |
| shipping_settings | `/shipping-settings` CRUD | `revenue.*` |
| gateways | `GET/POST /gateways`, `PUT /gateways/:id`, `POST /gateways/:id/activate` | `integrations.*` (segredos cifrados/mascarados) |
| integrations | `/integrations` CRUD + `/:id/activate` | `integrations.*` |
| blocked_words | `/blocked-words` CRUD | `security.*` |
| setting logs | `GET /setting-logs` | `audit.view` |

## category — `/categories`
`GET /`, `GET /tree`, `GET /:slug`, `GET /:id/fields` (público) ·
`POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/fields`, `PUT /fields/:fieldId`, `DELETE /fields/:fieldId` (`specifications.manage`)

## product — `/products`
`GET /`, `GET /:id` (público) · `POST /`, `PUT /:id`, `DELETE /:id`, `POST /:id/publish`, `POST /:id/highlight` (auth) · `PATCH /:id/status` (`specifications.manage`)

## order — `/orders`
`POST /checkout`, `GET /`, `GET /:id`, `POST /:id/cancel`, `POST /:id/disputes` (auth) ·
`PATCH /disputes/:id/resolve` (`orders.resolve_dispute`) · `GET /admin/all` (`orders.view`)

## payment — `/payments`
`POST /order/:orderId/preference` (Checkout Pro) · `POST /order/:orderId/pay` (Checkout API, captura configurável) · **`POST /webhook` (sem auth — gateway)** · `GET /:id` (auth)
**Repasse/Split (OAuth do vendedor):** `GET /connect/mercado-pago` (auth → URL de autorização) · `GET /connect/mercado-pago/callback` (sem auth — MP redireciona) · `GET /connect/status` (auth) · `DELETE /connect/mercado-pago` (auth)
> Split nativo: pagamento criado com token do vendedor + `marketplace_fee`/`application_fee` = comissão. Retenção configurável (`payment.hold_strategy`: `platform_escrow` | `mp_capture` | `mp_release_days`). Captura na liberação do escrow.

## escrow — `/escrow`
`GET /order/:orderId`, `POST /order/:orderId/release` (auth) · `GET /admin/pending` (`orders.view`)
> Liberação automática (7 dias) via cron `src/jobs/scheduler.js` → `escrow.service.releaseDue()`.

## shipment — `/shipments`
`POST /quote` (body: `from_zip`, `to_zip`, `products[]`, opc. `order_amount` + `category_ids` p/ frete grátis), `POST /order/:orderId`, `POST /:id/label`, `GET /:id/track` (auth)
> `shipping_settings` (admin): markup `%`/fixo, **frete grátis** (mínimo + categorias) e limites de peso/valor aplicados na cotação.

## notification — `/notifications`
`POST /devices` (registrar token FCM/OneSignal) · `DELETE /devices` · `GET /` (listar) · `POST /read-all` · `PATCH /:id/read` (auth) · `POST /test` (`push.manage`)
> Push pelo provider ativo (FCM HTTP v1 / OneSignal) configurado em `integration_settings`.

## chat — `/chats`
`POST /`, `GET /`, `GET /:id/messages`, `POST /:id/messages`, `POST /:id/close` (auth) ·
`GET /admin/flagged` (`chat.view`), `PATCH /messages/:id/moderate` (`chat.moderate`)
> WebSocket (Socket.io): `chat:join`, `message:send`, `message:new`, `typing`. Moderação por `blocked_words`.
