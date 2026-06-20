# Onboarding — API Feira do Rolo

## Pré-requisitos
- Node.js 18+ (usa `node --watch`).
- Acesso a um PostgreSQL (Neon ou local).

## 1. Instalar dependências
```bash
cd feiradorolo--api
npm install
```

## 2. Configurar ambiente
```bash
cp .env.example .env
# Edite .env e preencha DATABASE_URL (e DB_SSL=false se Postgres local sem SSL).
```
Detalhes de cada variável em [ENV_REFERENCE.md](./ENV_REFERENCE.md).

## 3. Criar o schema (migrations)
```bash
npm run migrate          # cria todas as tabelas do zero
npm run seed             # popula configs, categorias, RBAC e o SUPER ADMIN
```
> O `npm run seed` cria o super admin a partir do `.env` (`ADMIN_EMAIL` /
> `ADMIN_PASSWORD` / `ADMIN_NAME`). Faça login em `POST /api/v1/auth/login` e
> configure o gateway, integrações e regras pelo painel `/admin`.
Para recriar tudo:
```bash
npm run db:reset         # undo:all -> migrate -> seed
```

## 4. Verificar
As tabelas criadas (23) estão listadas em [models/DATABASE.md](./models/DATABASE.md).
O seed cria as configurações de comissão/destaque/escrow e as 5 categorias raiz.

> O `gen_random_uuid()` usado nos seeders é nativo do PostgreSQL 13+ (Neon).

## 5. Próxima etapa (ainda não implementada)
- `app.js` (entrada Express) e `src/routes/index.js` (agregador `/v1`).
- Features em `src/features/<nome>/` no fluxo controller → service.
- Providers em `src/providers/` (Mercado Pago, Melhor Envio, Firebase, Brevo/Zoho).

## Logs
- SQL do Sequelize: defina `DB_LOGGING=true` no `.env`.
- Trilha de auditoria de negócio: tabela `security_logs`.
