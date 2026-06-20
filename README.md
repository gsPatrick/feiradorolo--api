# Feira do Rolo — API

Backend do marketplace **Feira do Rolo** — uma plataforma de compra e venda entre pessoas (C2C) com **custódia de pagamento (escrow)**, **antifraude/KYC por verificação facial**, **chat moderado em tempo real**, **frete integrado (Melhor Envio)**, **pagamentos (Mercado Pago)** e um **painel administrativo** onde *quase tudo* é configurável sem mexer no código.

> **Stack:** Node.js 20 · Express · Sequelize · PostgreSQL · Socket.io · JWT · node-cron
> **Frontend:** [`feiradorolo--frontend`](https://github.com/gsPatrick/feiradorolo--frontend) (Next.js 14)

---

## Índice

1. [Visão geral do produto](#1-visão-geral-do-produto)
2. [Princípio central: configuração dinâmica (zero hardcoding)](#2-princípio-central-configuração-dinâmica-zero-hardcoding)
3. [Arquitetura e stack](#3-arquitetura-e-stack)
4. [Estrutura de pastas](#4-estrutura-de-pastas)
5. [Modelo de dados](#5-modelo-de-dados)
6. [Módulos / features](#6-módulos--features)
7. [Segurança e antifraude](#7-segurança-e-antifraude)
8. [Fluxos de negócio](#8-fluxos-de-negócio)
9. [Tempo real (Socket.io)](#9-tempo-real-socketio)
10. [Tarefas agendadas (cron)](#10-tarefas-agendadas-cron)
11. [Variáveis de ambiente](#11-variáveis-de-ambiente)
12. [Rodando localmente](#12-rodando-localmente)
13. [Docker e deploy](#13-docker-e-deploy)
14. [Banco: migrations, seeders e credenciais demo](#14-banco-migrations-seeders-e-credenciais-demo)
15. [Convenções da API](#15-convenções-da-api)
16. [Mapa de endpoints](#16-mapa-de-endpoints)

---

## 1. Visão geral do produto

A Feira do Rolo conecta **compradores** e **vendedores** pessoa-física. O diferencial é a **segurança da transação**:

- O dinheiro do comprador fica **retido em custódia (escrow)** e só é repassado ao vendedor após a confirmação de recebimento (ou após um prazo sem disputa).
- **Verificação facial (KYC)** trava ações sensíveis: o vendedor não gera etiqueta sem se verificar; o pedido do comprador fica retido na 1ª compra até a verificação.
- Há **retirada presencial** com **token de 6 dígitos** liberado no encontro, com alertas de segurança.
- O **chat** entre as partes é **moderado** (palavras bloqueadas) e tem **anti-spam**.
- A plataforma cobra **comissão** (com snapshot imutável por pedido) e pode aplicar **markup no frete**.

Tudo isso é operável por um **Painel Admin** com 14 áreas (pedidos, financeiro, usuários, segurança, integrações, personalização do site, etc.).

---

## 2. Princípio central: configuração dinâmica (zero hardcoding)

A regra de ouro do projeto: **se a informação pode mudar, ela mora no banco e é editável pelo admin** — não no código nem no `.env`.

O `.env` carrega **apenas** o bootstrap do processo e os **segredos-raiz** (conexão do banco, `JWT_SECRET`, chave de criptografia). **Todo o resto** é resolvido em tempo real a partir de tabelas de parametrização, com um **cache em memória** (TTL curto) que é **invalidado** sempre que o admin salva uma alteração:

| Tabela | O que controla |
|---|---|
| `platform_settings` | URLs públicas, CORS, nome/identidade, e-mail remetente, validade do JWT, máx. de parcelas, regras de verificação facial… |
| `commission_rules` | Percentual de comissão por tier/categoria, dias de escrow, prioridade |
| `payment_gateway_settings` | Credenciais do Mercado Pago (**cifradas**) |
| `integration_settings` | Melhor Envio, Brevo, Firebase, FCM, OneSignal (**cifradas**) |
| `shipping_settings` | Markup de frete (% e fixo), frete grátis, origem |
| `highlight_packages` | Pacotes/planos de destaque de anúncios |
| `blocked_words` | Moderação do chat |
| `content_pages` / `banners` | Conteúdo do site (páginas institucionais, FAQ, home) |

> O *engine* fica em `src/services/settings.cache.js`. Toda mutação no admin grava também um registro **imutável** em `setting_change_logs` (trilha de auditoria).

---

## 3. Arquitetura e stack

- **Express** com prefixo configurável (`/api/v1`), `helmet`, `cors` dinâmico (origens vindas do banco).
- **Sequelize** sobre **PostgreSQL** (compatível com Neon — SSL). Convenção `underscored: true` → colunas `snake_case`, atributos JS `camelCase`.
- **JWT** (Bearer) para autenticação; **RBAC** por papéis/permissões.
- **Socket.io** para chat e notificações em tempo real.
- **node-cron** para liberação automática de escrow.
- **multer** para upload de imagens (servidas em `/uploads`).
- Padrão **feature-per-folder**: cada domínio tem `*.routes.js` → `*.controller.js` → `*.service.js`.
- Respostas e erros padronizados (`utils/apiResponse.js`, `utils/AppError.js`, `utils/catchAsync.js`).

---

## 4. Estrutura de pastas

```
feiradorolo--api/
├── app.js                  # bootstrap do Express + Socket.io + scheduler
├── config/
│   └── config.js           # config do Sequelize (usa DATABASE_URL, SSL)
├── migrations/             # 48+ migrations (schema do banco)
├── seeders/                # 21+ seeders (RBAC, admin, dados demo)
├── .sequelizerc            # mapeia caminhos do sequelize-cli
└── src/
    ├── models/             # models Sequelize (entidades)
    ├── middlewares/        # auth (JWT), roleCheck (RBAC), errorHandler
    ├── realtime/           # Socket.io (io.js, socket.js)
    ├── jobs/               # scheduler.js (cron de escrow)
    ├── providers/          # integrações externas (Mercado Pago, Melhor Envio, push)
    ├── services/           # settings.cache, moderation, permission…
    ├── utils/              # apiResponse, AppError, crypto, validators…
    └── features/           # um diretório por domínio (ver abaixo)
```

---

## 5. Modelo de dados

Principais entidades (cada uma com sua migration + model):

- **Identidade & acesso:** `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_bans`, `facial_verifications`.
- **Catálogo:** `products`, `categories` (+ campos/atributos dinâmicos), `favorites`, `reviews`, `questions`.
- **Transação:** `orders`, `order_items`, `payments`, `escrow`, `disputes`, `shipments`, `coupons`, `addresses`.
- **Comunicação:** `chats`, `chat_messages`, `notifications`, `device_tokens`, `message_templates`.
- **Parametrização (admin):** `platform_settings`, `commission_rules`, `shipping_settings`, `highlight_packages`, `payment_gateway_settings`, `integration_settings`, `blocked_words`, `setting_change_logs`, `content_pages`, `banners`.

Campos-chave de antifraude no `users`: `seller_verification_status`, `buyer_verification_status`, `has_first_sale`, `has_first_purchase`.
No `orders`: snapshots `commission_rate`/`commission_amount`/`seller_amount`, `held_for_buyer_verification`, `delivery_method` (`shipping`/`pickup`).
No `escrow`: `status`, `hold_days`, `release_due_at`, `pickup_token` (6 dígitos).

---

## 6. Módulos / features

| Feature | Responsabilidade |
|---|---|
| **auth** | Cadastro (com validação de CPF/CNPJ por `person_type`), login, sessão JWT, perfil. |
| **user** | Perfil, RBAC (atribuir/remover papéis), banimentos, **verificação facial (KYC)**. |
| **product** | CRUD de anúncios, busca/listagem, destaque, estoque. |
| **category** | Categorias e **campos/atributos dinâmicos** por categoria. |
| **order** | Checkout (1 pedido por vendedor), **snapshots financeiros**, listagem (compras/vendas), **disputas**. |
| **payment** / **payment-account** | Integração Mercado Pago, status de pagamento, captura/repasse. |
| **escrow** | Custódia: retenção por N dias, liberação manual (comprador), **liberação por token presencial**, liberação automática (cron). |
| **shipment** | Cotação e etiqueta (Melhor Envio) com **markup**; **trava KYC do vendedor** na etiqueta. |
| **chat** | Conversas comprador↔vendedor, **moderação (blocked_words)**, **anti-spam**, visão/atuação do admin. |
| **review** / **question** | Avaliações e perguntas públicas nos produtos. |
| **coupon** | Cupons (validação e cálculo de desconto). |
| **address** | Endereços do usuário (CRUD + padrão). |
| **notification** | Notificações in-app + push (FCM/OneSignal) com **fallback via socket**; admin: broadcast e limpeza. |
| **analytics** | Visão geral, **dashboard** (contadores reais) e **saúde do sistema**. |
| **content-page** | Páginas institucionais e FAQ (conteúdo editável pelo admin). |
| **platform-settings** | Engine de configurações + criptografia de segredos + auditoria. |
| **email-template** | Modelos de e-mail (CRUD). |
| **upload** | Upload de imagens (multer). |

---

## 7. Segurança e antifraude

- **JWT + RBAC:** `auth` middleware valida o token; `authorize('permissao')` checa a permissão (cache em `permission.service`). Papéis: `super_admin`, `admin`, `finance`, `moderator`, `support`, `seller`.
- **Criptografia de segredos:** `utils/crypto.js` usa **AES-256-GCM** com chave mestra (`APP_ENCRYPTION_KEY`, derivada do `JWT_SECRET` em dev). Credenciais de gateway/integrações são gravadas **cifradas** (`*_encrypted`) e **nunca** retornam em texto.
- **KYC / verificação facial:**
  - **Vendedor:** não gera etiqueta de postagem sem `seller_verification_status = verified` (regra `facial.seller_required_after_first_sale`).
  - **Comprador:** na 1ª compra, o pedido nasce `held_for_buyer_verification = true` (fica "em análise" para o vendedor) e só é liberado quando o comprador conclui a verificação — momento em que o vendedor é notificado.
- **Retirada presencial:** pedidos `delivery_method = pickup` geram um **token de 6 dígitos** no escrow; o comprador o revela **apenas no encontro** e o vendedor o informa para liberar a custódia. Notificações de segurança ("local público e movimentado") são enviadas às duas partes. O token só é visível ao **comprador** (mascarado para os demais).
- **Comissão imutável:** no checkout, a comissão vigente é **congelada** no pedido (`commission_rate`/`commission_amount`/`seller_amount`). Mudar a regra depois **não afeta** pedidos antigos.
- **Moderação + anti-spam no chat:** `blocked_words` interceptam mensagens; **limite de 5 mensagens / 30s** por remetente.

---

## 8. Fluxos de negócio

**Compra padrão (envio):**
1. `POST /orders/checkout` — agrupa itens por vendedor, congela comissão, cria pedido(s).
2. Pagamento (Mercado Pago) → ao confirmar, cria o **escrow** (`status=held`, `release_due_at = hoje + N dias`).
3. Vendedor gera etiqueta (Melhor Envio, com markup) — **se verificado**.
4. Comprador confirma recebimento → `POST /escrow/order/:id/release` **ou** o **cron** libera após o prazo sem disputa.

**Compra com retirada presencial:**
- Checkout com `delivery_method=pickup` → escrow com `pickup_token`. No encontro, o comprador informa o código; vendedor chama `POST /escrow/order/:id/release-token`.

**Disputa:**
- `POST /orders/:id/dispute` → pedido e escrow vão para `disputed` (o cron **não** libera enquanto houver disputa aberta). Admin resolve.

---

## 9. Tempo real (Socket.io)

- Autenticação por token no handshake; cada usuário entra na própria "sala".
- **Chat:** `message:send` (com moderação + anti-spam) e broadcast aos participantes; o admin pode entrar e enviar mensagens.
- **Notificações:** `notifyUser()` cria o registro **e emite `notification:new` via socket** — entrega in-app em tempo real **mesmo sem provedor de push configurado** (fallback). Se FCM/OneSignal estiver configurado, também dispara o push nativo.

---

## 10. Tarefas agendadas (cron)

`src/jobs/scheduler.js` registra (via `node-cron`) a **liberação automática de escrow**: de hora em hora, libera custódias `held` cujo `release_due_at` venceu, **pulando** pedidos em disputa, retidos por verificação do comprador, ou de retirada presencial (que exigem token). Iniciado em `app.js` (`scheduler.start()`).

---

## 11. Variáveis de ambiente

Copie `.env.example` para `.env`. **Só o essencial vive aqui** — o resto é configurado no painel admin.

```env
# Bootstrap do processo
NODE_ENV=production
PORT=3333
APP_API_PREFIX=/api/v1
LOG_LEVEL=info

# Banco (PostgreSQL / Neon)
DATABASE_URL=postgres://user:password@host:5432/feiradorolo
DB_SSL=true            # false em Postgres local sem SSL
DB_LOGGING=false

# Segredos-raiz
JWT_SECRET=troque-por-um-segredo-forte
APP_ENCRYPTION_KEY=    # 32 bytes em hex (64 chars). Vazio = derivado do JWT_SECRET (só dev)

# Bootstrap do super admin (usado pelo seeder)
ADMIN_EMAIL=admin@feiradorolo.com
ADMIN_PASSWORD=ChangeMe123!     # TROQUE em produção
ADMIN_NAME=Super Admin

# (Opcional) TTL dos caches em memória
# SETTINGS_CACHE_TTL_MS=60000
# PERMISSION_CACHE_TTL_MS=30000
# MODERATION_CACHE_TTL_MS=60000
```

> Mercado Pago, Melhor Envio, Brevo, FCM/OneSignal, comissões, frete/markup, destaques, CORS, URLs públicas etc. são configurados **no painel `/admin`** (gravados no banco, cifrados quando sensíveis).

---

## 12. Rodando localmente

Pré-requisitos: **Node 20+** e **PostgreSQL** (local ou Neon).

```bash
cp .env.example .env          # edite DATABASE_URL e JWT_SECRET
npm install
npm run migrate               # cria o schema
npm run seed                  # RBAC + super admin + dados demo
npm run dev                   # sobe com --watch em http://localhost:3333
```

Health check: `GET http://localhost:3333/api/v1/ping`.

Scripts úteis:

```bash
npm start            # produção (node app.js)
npm run migrate      # aplica migrations pendentes
npm run seed         # roda os seeders
npm run db:reset     # desfaz tudo, migra e semeia de novo (CUIDADO: apaga dados)
```

---

## 13. Docker e deploy

A imagem aplica as **migrations** no boot e sobe a API.

```bash
# Build
docker build -t feiradorolo-api .

# Run (com volume para uploads persistirem)
docker run -d --name feiradorolo-api \
  --env-file .env \
  -p 3333:3333 \
  -v feiradorolo_uploads:/app/uploads \
  feiradorolo-api

# Primeira subida: popular RBAC + super admin + demo
docker exec -it feiradorolo-api npm run seed
```

Notas de deploy:
- Aponte `DATABASE_URL` para o Postgres gerenciado (Neon → mantenha `DB_SSL=true`).
- Configure **CORS** e **URLs públicas** no painel admin (não no `.env`).
- O diretório `/app/uploads` deve ser um **volume** para persistir imagens entre deploys.
- Com múltiplas réplicas, rode as migrations num passo único de deploy (não confie no boot concorrente).

---

## 14. Banco: migrations, seeders e credenciais demo

- **48+ migrations** descrevem todo o schema; **21+ seeders** populam papéis/permissões (RBAC), o super admin e um conjunto de dados de demonstração (produtos, categorias, pedidos, cupons, endereços, páginas de conteúdo, etc.).

**Credenciais de demonstração** (após `npm run seed`):

| Papel | E-mail | Senha |
|---|---|---|
| Super admin | `admin@feiradorolo.com` | `ChangeMe123!` |
| Comprador | `maria@feiradorolo.com` | `ChangeMe123!` |

> **Troque essas senhas em produção** (via `ADMIN_*` no `.env` antes do seed, e alterando no painel).

---

## 15. Convenções da API

- **Base:** todas as rotas sob `APP_API_PREFIX` (padrão `/api/v1`).
- **Auth:** header `Authorization: Bearer <jwt>`.
- **Respostas de sucesso:** `{ success: true, data, message? }` (helpers `sendOk`/`sendCreated`/`sendNoContent`/`paginated`).
- **Erros:** `{ success: false, error: { code, message, details? } }`, com status HTTP adequado (`AppError`: 400/401/403/404/409/422/429…).
- **Timestamps:** Sequelize devolve `createdAt`/`updatedAt` (camelCase), colunas no banco em `snake_case`.

---

## 16. Mapa de endpoints

Prefixo: `/api/v1`. (Lista resumida — consulte cada `*.routes.js` para detalhes/permissões.)

| Recurso | Rotas principais |
|---|---|
| **Auth** | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| **Usuários** | `GET/PATCH /users/me`, `GET /users`, papéis, banir, **verificação facial** |
| **Produtos** | `GET /products`, `GET /products/:id`, `POST/PATCH/DELETE /products` |
| **Categorias** | `GET /categories`, campos dinâmicos (admin) |
| **Pedidos** | `POST /orders/checkout`, `GET /orders` (compras), `/orders/sales`, `POST /orders/:id/dispute` |
| **Escrow** | `GET /escrow/order/:id`, `POST /escrow/order/:id/release`, `POST /escrow/order/:id/release-token`, `GET /escrow/admin/pending` |
| **Pagamentos** | `POST /payments/...`, webhooks Mercado Pago |
| **Frete** | `POST /shipments/quote`, etiqueta (gera com trava KYC) |
| **Chat** | `GET /chats`, `GET/POST /chats/:id/messages`, `GET /chats/admin/all` |
| **Avaliações/Perguntas** | `GET/POST /reviews`, `GET/POST /questions` |
| **Cupons** | `GET /coupons`, `POST /coupons/validate` |
| **Endereços** | `GET/POST/PATCH/DELETE /addresses`, `POST /addresses/:id/default` |
| **Notificações** | `GET /notifications`, `POST /notifications/read-all`, admin: `GET/POST/DELETE /notifications/admin` |
| **Analytics** | `GET /analytics/overview`, `GET /analytics/dashboard`, `GET /analytics/system` |
| **Conteúdo** | `GET /content-pages/:slug`, `GET /content-pages/all`, `PUT /content-pages/:slug` (admin) |
| **Config (admin)** | `GET /config/fees` (público), `platform-settings`, gateways, integrações |
| **Uploads** | `POST /uploads` (multipart), arquivos servidos em `/uploads` |

---

Feito com cuidado para ser **seguro por padrão** e **operável pelo admin**. Para o cliente web, veja o repositório do [frontend](https://github.com/gsPatrick/feiradorolo--frontend).
