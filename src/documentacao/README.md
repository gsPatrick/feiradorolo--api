# Feira do Rolo — API · Documentação

Documentação viva do backend. **Comece por aqui.**

## Índice
- [ONBOARDING.md](./ONBOARDING.md) — como rodar local, migrar o banco, criar o primeiro usuário.
- [ENV_REFERENCE.md](./ENV_REFERENCE.md) — todas as variáveis de ambiente.
- [API.md](./API.md) — mapa completo de rotas (`/api/v1`).
- [INTEGRACOES.md](./INTEGRACOES.md) — provedores externos (MP, Melhor Envio, Firebase, Brevo/Zoho, FCM/OneSignal).
- [models/DATABASE.md](./models/DATABASE.md) — contrato campo-a-campo das tabelas (camada atual).
- [Registo_Migracoes.md](./Registo_Migracoes.md) — log das migrations aplicadas.

## Stack
Node.js · Express · PostgreSQL (Neon) · **Sequelize** (JavaScript).

## Estado atual do repositório
API **completa e funcional** (end-to-end testada contra PostgreSQL):
- Camada de dados: 39 models, 40 migrations, 10 seeders.
- Fundação: `app.js`, utils, middlewares, engine de config com cache, providers,
  realtime (Socket.io) e jobs (cron de escrow).
- 10 features (`src/features/`): auth, user, platform-settings (admin),
  category, product, order, payment, escrow, shipment, chat.
- Mapa de rotas completo em [API.md](./API.md).

## Convenções
- `app.js` na raiz (entrada Express) — a ser criado na próxima etapa.
- Fluxo por requisição: `routes → controller → service` (sem chamadas externas no controller).
- Integrações externas em `src/providers/<sistema>/`.
- Rotas versionadas sob `/api/v1` (`APP_API_PREFIX`).
- Colunas em `snake_case` (`underscored: true`); models com nome em PascalCase.
