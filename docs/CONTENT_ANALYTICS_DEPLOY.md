# FAQ, blog, leads e analytics

## Arquitetura preservada

- frontend público e área autenticada: React 18, Vite, Tailwind e PWA;
- API: Express com validação Zod;
- banco: PostgreSQL próprio com Prisma;
- produção: Docker Compose em `/opt/saudepet`, publicado por Caddy;
- domínio público e API: `https://saudepet.app.br`;
- área administrativa: `https://saudepet.app.br/admin`.

Não foi incluído serviço externo de banco, analytics ou editor. O blog usa Markdown renderizado como nós React, sem `dangerouslySetInnerHTML`.

## Variáveis novas

Backend:

- `PUBLIC_SITE_URL`: URL canônica do site público;
- `PUBLIC_TENANT_SLUG`: slug do tenant que receberá leads, visitas e conteúdo;
- `CORS_ORIGINS`: lista separada por vírgulas das origens públicas permitidas;
- `TRUST_PROXY_HOPS`: quantidade de proxies reversos confiáveis até o backend (`2` na topologia Caddy + Nginx atual);
- `ANALYTICS_HASH_SALT`: salt aleatório e estável usado no HMAC do IP, sem armazenar o IP completo;
- `ANALYTICS_RETENTION_DAYS`: retenção dos eventos, padrão 180 dias.
- `INDEXNOW_ENABLED`: ativa notificações de publicação para mecanismos compatíveis;
- `INDEXNOW_KEY`: chave aleatória da propriedade, nunca versionada;
- `INDEXNOW_ENDPOINT`: endpoint oficial do protocolo IndexNow;
- `N8N_SEO_WEBHOOK_URL`: webhook opcional do fluxo de publicação no n8n;
- `STATIC_CONTENT_LASTMOD`: data ISO da última alteração relevante nas páginas institucionais.

Frontend:

- `VITE_PUBLIC_SITE_URL`: base para canonical, Open Graph e JSON-LD;
- `VITE_WHATSAPP_URL`: canal oficial completo; deixe vazio enquanto não estiver validado.

Os modelos completos estão nos arquivos `.env.example`. Nunca copie os valores reais para o repositório.

## Migration

Arquivo: `backend/prisma/migrations/20260803150000_add_content_leads_analytics/migration.sql`.

Tabelas:

- `visit_sessions`;
- `page_views`;
- `leads`;
- `blog_categories`;
- `blog_posts`.

Aplicar em produção, depois de backup e antes de recriar o backend:

```bash
cd /opt/saudepet
docker compose build backend
docker compose run --rm backend npx prisma migrate deploy
docker compose up -d backend web
```

A migration foi exercitada em um schema PostgreSQL descartável com as 15 migrations do projeto e consulta aos cinco modelos novos. Ela não foi aplicada ao banco principal durante a validação local.

## Rotas

Públicas:

- `/`, `/faq`, `/blog`, `/blog/:slug`, `/privacidade`;
- `POST /api/public/leads`;
- `POST /api/public/analytics/page-view`;
- `GET /api/public/blog`, `/api/public/blog/:slug`, `/api/public/blog/categories`;
- `GET /api/public/sitemap.xml`.

Descoberta e conteúdo legível por máquinas:

- `/robots.txt` com regras explícitas para busca e agentes de IA;
- `/sitemap.xml` com páginas institucionais e artigos efetivamente públicos;
- `/llms.txt` e `/llms-full.txt`;
- `/rss.xml` e o alias `/feed.xml`;
- `/blog/:slug.md` para a versão Markdown canônica do artigo;
- HTML inicial das páginas públicas com metadata, canonical e JSON-LD;
- HTML inicial dos artigos com título, imagem, resumo e corpo completo;
- URLs desconhecidas retornam `404`, sem fallback de SPA;
- áreas autenticadas recebem `X-Robots-Tag: noindex, nofollow`.

Administrativas, com JWT e autorização de `admin` ou `super_admin` no servidor:

- `/admin/analytics`, `/admin/leads`, `/admin/blog`;
- `/admin/blog/novo`, `/admin/blog/:id/editar`;
- APIs sob `/api/admin/content`.

## Verificações

```bash
cd backend
npx prisma validate
npx prisma generate
npx jest tests/unit/schemas/content.schema.test.ts tests/unit/routes/content-admin.routes.test.ts --runInBand

cd ../frontend
npm run build
```

Após publicar:

```bash
docker compose ps
docker compose logs --tail=100 backend web
curl -fsS https://saudepet.app.br/api/health
curl -I https://saudepet.app.br/faq
curl -I https://saudepet.app.br/blog
curl -fsS https://saudepet.app.br/llms.txt
curl -fsS https://saudepet.app.br/rss.xml
```

## Retorno seguro

Antes do deploy, mantenha uma cópia com data e hora de:

- `/opt/saudepet` para os arquivos substituídos;
- `/etc/caddy/Caddyfile`;
- banco PostgreSQL com `pg_dump`.

Em caso de falha, restaure os arquivos, recarregue o Caddy e recrie os dois contêineres com o compose anterior. Migrations aditivas não devem ser revertidas apagando tabelas em produção; mantenha-as sem uso até investigação.

## Pendências comerciais

Antes de remover os avisos de validação no FAQ e na Política de Privacidade, confirmar:

- cidades e área de cobertura;
- SLA ou estimativa operacional;
- modalidades realmente disponíveis;
- cancelamento, reagendamento, preços e meios de pagamento;
- WhatsApp oficial;
- controlador legal, encarregado e canal LGPD.
