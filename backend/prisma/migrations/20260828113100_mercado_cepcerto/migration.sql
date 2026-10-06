-- Saúde Pet Mercado — cotação e postagem nacional pela CepCerto.

ALTER TABLE "mercado_lojas"
    ADD COLUMN "numero" VARCHAR,
    ADD COLUMN "aceita_transportadora" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "embalagem_altura_cm" DECIMAL(5,1),
    ADD COLUMN "embalagem_largura_cm" DECIMAL(5,1),
    ADD COLUMN "embalagem_comprimento_cm" DECIMAL(5,1);

ALTER TABLE "mercado_pedidos"
    ADD COLUMN "entrega_cep" VARCHAR,
    ADD COLUMN "entrega_numero" VARCHAR,
    ADD COLUMN "frete_servico" VARCHAR,
    ADD COLUMN "frete_transportadora" VARCHAR,
    ADD COLUMN "frete_prazo" VARCHAR,
    ADD COLUMN "frete_peso_gramas" INTEGER,
    ADD COLUMN "frete_altura_cm" DECIMAL(5,1),
    ADD COLUMN "frete_largura_cm" DECIMAL(5,1),
    ADD COLUMN "frete_comprimento_cm" DECIMAL(5,1),
    ADD COLUMN "rastreio_codigo" VARCHAR,
    ADD COLUMN "etiqueta_url" VARCHAR,
    ADD COLUMN "declaracao_url" VARCHAR,
    ADD COLUMN "etiqueta_emitida_em" TIMESTAMP(3);

ALTER TABLE "mercado_pedido_itens"
    ADD COLUMN "peso_gramas" INTEGER;

CREATE INDEX "mercado_pedidos_rastreio_codigo_idx"
    ON "mercado_pedidos"("rastreio_codigo");
