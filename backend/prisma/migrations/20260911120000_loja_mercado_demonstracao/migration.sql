-- Loja de demonstração nunca é pública.
--
-- Escrita à mão: `prisma migrate dev` arrasta a deriva do schema junto.
--
-- O campo é o portão: toda leitura pública do Mercado filtra
-- `demonstracao = false` e a aprovação recusa loja marcada. O UPDATE abaixo
-- marca a loja que o `seed-demo-mercado.js` cria, identificada pelo par
-- slug + e-mail que só o seed usa, e a devolve ao rascunho: ela foi aprovada
-- no painel em 01/09/2026 e ficou na vitrine, no sitemap e no feed.
-- Idempotente: em banco sem o seed, não muda linha nenhuma.

ALTER TABLE "mercado_lojas" ADD COLUMN "demonstracao" BOOLEAN NOT NULL DEFAULT false;

UPDATE "mercado_lojas"
SET "demonstracao" = true,
    "status" = 'rascunho',
    "aprovada_em" = NULL,
    "aprovada_por" = NULL
WHERE "slug" = 'petshop-biovet-rp'
  AND "email" = 'loja@biovet.com.br';
