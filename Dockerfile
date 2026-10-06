FROM node:22-bookworm AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
RUN npm ci
FROM deps AS build
COPY . .
RUN npm run build --workspace backend && npm run build
FROM build AS production_deps
RUN npm prune --omit=dev
FROM node:22-bookworm-slim AS backend
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=production_deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./dist
COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY --from=build /app/backend/prisma ./prisma
COPY --from=build /app/backend/scripts ./scripts
COPY --from=build /app/backend/package.json ./package.json
RUN groupadd -g 1001 nodejs && useradd -r -u 1001 -g nodejs expressjs && mkdir -p /app/uploads && chown -R expressjs:nodejs /app
USER expressjs
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server.js"]
FROM nginx:1.31-alpine AS web
COPY frontend/nginx.saudepet.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
