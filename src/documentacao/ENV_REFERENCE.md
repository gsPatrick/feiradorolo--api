# Referência de Variáveis de Ambiente

Fonte: `.env.example`. Nunca versione valores reais.

| Variável | Obrigatória | Grupo | Descrição |
|----------|:----------:|-------|-----------|
| `NODE_ENV` | não | App | `development` / `test` / `production`. |
| `PORT` | não | App | Porta HTTP (default 3333). Usada na próxima etapa. |
| `APP_API_PREFIX` | não | App | Prefixo das rotas (default `/api/v1`). |
| `DATABASE_URL` | **sim** | DB | String de conexão PostgreSQL (Neon). |
| `DB_SSL` | não | DB | `true` (default) exige SSL; `false` para Postgres local. |
| `DB_LOGGING` | não | DB | `true` loga o SQL no console. |
| `JWT_SECRET` | **sim** | Auth | Segredo de assinatura do JWT. |
| `JWT_EXPIRES_IN` | não | Auth | Expiração do token (default `7d`). |
| `MERCADOPAGO_ACCESS_TOKEN` | sim* | Pagamento | Token server-side do Mercado Pago. |
| `MERCADOPAGO_PUBLIC_KEY` | sim* | Pagamento | Chave pública (checkout). |
| `MERCADOPAGO_WEBHOOK_SECRET` | sim* | Pagamento | Validação de webhooks (split/escrow). |
| `FIREBASE_API_KEY` | sim* | Firebase | Auth social. |
| `FIREBASE_AUTH_DOMAIN` | sim* | Firebase | — |
| `FIREBASE_PROJECT_ID` | sim* | Firebase | — |
| `FIREBASE_STORAGE_BUCKET` | sim* | Firebase | Storage (Uppy). |
| `FIREBASE_MESSAGING_SENDER_ID` | sim* | Firebase | — |
| `FIREBASE_APP_ID` | sim* | Firebase | — |
| `FIREBASE_SERVICE_ACCOUNT` | sim* | Firebase | JSON da service account (Admin SDK). |
| `BREVO_API_KEY` | sim* | E-mail | E-mails transacionais. |
| `ZOHO_IMAP_HOST` | sim* | E-mail | Host IMAP do Zoho. |
| `ZOHO_IMAP_USER` | sim* | E-mail | Usuário IMAP. |
| `ZOHO_IMAP_PASSWORD` | sim* | E-mail | Senha/app password IMAP. |
| `MELHOR_ENVIO_TOKEN` | sim* | Frete | Token da API. |
| `MELHOR_ENVIO_CLIENT_ID` | sim* | Frete | OAuth client id. |
| `MELHOR_ENVIO_CLIENT_SECRET` | sim* | Frete | OAuth client secret. |
| `FCM_SERVER_KEY` | não | Push | Futuro (Notificações Push). |
| `ONESIGNAL_APP_ID` | não | Push | Futuro. |
| `ONESIGNAL_API_KEY` | não | Push | Futuro. |

> **Atualização:** as credenciais de serviços (Mercado Pago, Firebase, Brevo,
> Zoho, Melhor Envio, FCM, OneSignal) e configs de app (URLs públicas, CORS,
> remetente de e-mail, validade de token) **NÃO ficam mais no `.env`** — são
> gerenciadas pelo admin no banco (`payment_gateway_settings`,
> `integration_settings`, `platform_settings`). O `.env` guarda só o bootstrap
> do processo e os segredos-raiz (`DATABASE_URL`, `JWT_SECRET`,
> `APP_ENCRYPTION_KEY`). Ver o `.env.example` atualizado e `INTEGRACOES.md`.

### Por que `JWT_SECRET` e `APP_ENCRYPTION_KEY` ficam no `.env`?
São a raiz de confiança: o primeiro assina os tokens; o segundo **decifra** os
segredos guardados no banco. Colocá-los no próprio banco que protegem anularia a
segurança. Todo o resto é configurável pelo admin.
