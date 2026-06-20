# =============================================================================
# Feira do Rolo — API (Node 20 · Express · Sequelize · PostgreSQL · Socket.io)
# =============================================================================
# Build:  docker build -t feiradorolo-api .
# Run:    docker run -d --env-file .env -p 3333:3333 \
#               -v feiradorolo_uploads:/app/uploads feiradorolo-api
#
# Na primeira subida, popule o banco (RBAC, super admin e dados demo):
#   docker exec -it <container> npm run seed
# =============================================================================

FROM node:20-alpine

WORKDIR /app

# Dependências — inclui devDependencies porque o sequelize-cli (migrations)
# vive em devDependencies e é usado no boot do container.
COPY package.json package-lock.json ./
RUN npm ci

# Código da aplicação
COPY . .

# Diretório de uploads (servido estaticamente em /uploads). Monte um volume
# nomeado para persistir os arquivos entre deploys.
RUN mkdir -p uploads
VOLUME ["/app/uploads"]

ENV NODE_ENV=production
ENV PORT=3333
EXPOSE 3333

# Aplica as migrations pendentes (idempotente) e sobe a API.
CMD ["sh", "-c", "npm run migrate && node app.js"]
