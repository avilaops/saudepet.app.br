-- Cartão guardado pelo tutor.
--
-- Guardamos REFERÊNCIA, nunca o cartão: o identificador que o gateway devolve,
-- mais o que serve para a pessoa reconhecer qual é. Número e código de
-- segurança nunca passam pelo nosso servidor — quem os recebe é o SDK do
-- gateway, direto do navegador.
--
-- Aditiva: tabela nova.
CREATE TABLE "cartoes_salvos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "gateway" TEXT NOT NULL DEFAULT 'mercadopago',
    "customer_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "bandeira" TEXT,
    "ultimos_digitos" TEXT NOT NULL,
    "validade_mes" INTEGER,
    "validade_ano" INTEGER,
    "apelido" TEXT,
    "principal" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cartoes_salvos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "cartoes_salvos_usuario_id_gateway_card_id_key"
    ON "cartoes_salvos"("usuario_id", "gateway", "card_id");
CREATE INDEX "cartoes_salvos_tenant_id_idx" ON "cartoes_salvos"("tenant_id");
CREATE INDEX "cartoes_salvos_usuario_id_idx" ON "cartoes_salvos"("usuario_id");

ALTER TABLE "cartoes_salvos" ADD CONSTRAINT "cartoes_salvos_usuario_id_fkey"
    FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
