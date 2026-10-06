-- Saúde Pet Mercado — texto alternativo da foto de capa do produto.
-- Aditiva: a vitrine cai para o nome completo quando a coluna é nula.

ALTER TABLE "mercado_produtos"
    ADD COLUMN "imagem_alt" VARCHAR;
