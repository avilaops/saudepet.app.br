-- Saúde Pet Mercado — a foto de capa passa a ter status e a marca de etiqueta.
-- Aditiva. Quem já tem capa hoje subiu pela tela do lojista: nasce aprovada.

ALTER TABLE "mercado_produtos"
    ADD COLUMN "imagem_status" VARCHAR,
    ADD COLUMN "imagem_tem_etiqueta" BOOLEAN NOT NULL DEFAULT false;

UPDATE "mercado_produtos" SET "imagem_status" = 'aprovada' WHERE "imagem_url" IS NOT NULL;
