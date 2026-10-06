FROM node:20-bookworm AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
RUN npx prisma generate
COPY src ./src
COPY tsconfig.json ./
# TypeScript é o padrão da casa e o JavaScript legado atravessa junto
# (`allowJs`): o compilador escreve `src` inteiro em `dist`, que é o que roda.
#
# `npx tsc` direto, e NÃO `npm run build`: o `prebuild` do backend chama
# `../scripts/verificar-dados-falsos.mjs`, que está fora do contexto desta
# imagem (o contexto é `./backend`). Trocando por `npm run build` sem copiar
# aquela pasta, a imagem para de assar com "cannot find module".
RUN npx tsc

# Runtime em `slim`: a imagem cheia do Debian carrega compilador, git, Python
# e um mundo de coisas que so o build precisa. Aqui roda `node dist/server.js`
# e nada mais - o Prisma pede `openssl`, instalado logo abaixo. So essa troca
# tira quase 1 GB da imagem, num servidor cujo volume do Docker vive em 90 e
# poucos por cento.
FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update && \
    apt-get install -y --no-install-recommends openssl ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --only=production && \
    npm cache clean --force

COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/dist ./dist
COPY scripts ./scripts

RUN groupadd -g 1001 nodejs && \
    useradd -r -u 1001 -g nodejs expressjs
RUN mkdir -p /app/uploads && \
    chown -R expressjs:nodejs /app

USER expressjs

ENV NODE_ENV=production
ENV PORT=3000

COPY docker-entrypoint.sh /usr/local/bin/
ENTRYPOINT ["docker-entrypoint.sh"]

HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

EXPOSE 3000
CMD ["node", "dist/server.js"]
