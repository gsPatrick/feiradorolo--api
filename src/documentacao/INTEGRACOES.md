# Integrações Externas — Provedores

Todas as credenciais são gerenciadas pelo admin (cifradas) em
`payment_gateway_settings` (pagamento) e `integration_settings` (demais).
Os providers leem dinamicamente — nada de chave fixa no código.

## Mercado Pago (`providers/mercado-pago`)
- **Pagamento + Split/repasse nativo.** OAuth por vendedor, `marketplace_fee`/
  `application_fee` = comissão, captura/liberação configurável. Credenciais do
  app em `payment_gateway_settings`. Ver API.md (`/payments/connect/...`).

## Melhor Envio (`providers/melhor-envio`) — frete
- Base: prod `https://www.melhorenvio.com.br/api/v2`, sandbox
  `https://sandbox.melhorenvio.com.br/api/v2`. Auth Bearer.
- Endpoints: `/me/shipment/calculate`, `/me/cart`, `/me/shipment/checkout`,
  `/me/shipment/generate`, `/me/shipment/print`, `/me/shipment/tracking`.
- Config: `integration_settings` (service=`melhor_envio`) → `credentials.token`,
  `config.userAgent`, `environment`. Markup/regras em `shipping_settings` (admin).

## Firebase (`providers/firebase`) — auth social
- Verificação do ID token: RS256 com certs públicos do securetoken, `iss`=
  `https://securetoken.google.com/{projectId}`, `aud`=projectId. Correto/sem SDK.
- Config: `integration_settings` (service=`firebase`) → `config.projectId`,
  `config.storageBucket` (fallback p/ env Firebase).

## E-mail — Brevo / Zoho (`providers/email`)
- Provedor ativo escolhido pelo admin (Brevo tem precedência, depois Zoho).
- **Brevo:** `POST https://api.brevo.com/v3/smtp/email`, header `api-key`.
- **Zoho (ZeptoMail):** `POST https://api.zeptomail.com/v1.1/email`, header
  `Authorization: Zoho-enczapikey <key>`.
- Config: `integration_settings` (service=`brevo`|`zoho`) → `credentials.apiKey`,
  `config.senderEmail`, `config.senderName`. Conteúdo em `message_templates`.

## Push — FCM / OneSignal (`providers/push`)
- **Correção:** a API legada do FCM (`Authorization: key=SERVER_KEY`) foi
  descontinuada. Usamos **FCM HTTP v1**: JWT assinado com a service account →
  access_token OAuth2 → `POST https://fcm.googleapis.com/v1/projects/{id}/messages:send`.
- **OneSignal:** `POST https://onesignal.com/api/v1/notifications`, header
  `Authorization: Basic <REST_API_KEY>`.
- Config: `integration_settings` (service=`fcm` → `credentials.serviceAccount`,
  `config.projectId`; ou service=`onesignal` → `credentials.restApiKey`,
  `config.appId`). Endpoints em `/notifications` (registro de device, teste).

> Cada serviço tem uma linha em `integration_settings` por ambiente; o provider
> usa a linha `is_active`. Segredos ficam em `credentials_encrypted` (AES-256-GCM).
