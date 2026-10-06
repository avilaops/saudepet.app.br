-- Saúde Pet Mercado — terceira fatia: assinatura de ração com entrega programada.
--
-- Aditiva por inteiro. A loja ganha três colunas de política (com default, nada
-- muda para quem já existe); o pedido ganha o vínculo opcional com a assinatura.

-- ── Loja: política de assinatura ─────────────────────────────────────────────
ALTER TABLE "mercado_lojas"
    ADD COLUMN "aceita_assinatura" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "assinatura_desconto_pct" DECIMAL(5,2) NOT NULL DEFAULT 5,
    ADD COLUMN "assinatura_frete_gratis" BOOLEAN NOT NULL DEFAULT false;

-- ── Status da assinatura ─────────────────────────────────────────────────────
CREATE TYPE "StatusAssinaturaMercado" AS ENUM ('ativa', 'pausada', 'cancelada');

-- ── Assinatura ───────────────────────────────────────────────────────────────
CREATE TABLE "mercado_assinaturas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "loja_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "pet_id" TEXT,
    "status" "StatusAssinaturaMercado" NOT NULL DEFAULT 'ativa',
    "frequencia_dias" INTEGER NOT NULL,
    "proximo_ciclo_em" TIMESTAMP(3) NOT NULL,
    "entrega_tipo" "EntregaMercado" NOT NULL DEFAULT 'retirada',
    "entrega_endereco" TEXT,
    "entrega_cep" TEXT,
    "entrega_numero" TEXT,
    "entrega_complemento" TEXT,
    "entrega_cidade" TEXT,
    "entrega_latitude" DOUBLE PRECISION,
    "entrega_longitude" DOUBLE PRECISION,
    "desconto_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "frete_gratis" BOOLEAN NOT NULL DEFAULT false,
    "ciclos_gerados" INTEGER NOT NULL DEFAULT 0,
    "ciclos_pagos" INTEGER NOT NULL DEFAULT 0,
    "ciclos_perdidos_seguidos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_pedido_id" TEXT,
    "ultimo_erro" TEXT,
    "observacao" TEXT,
    "pausada_em" TIMESTAMP(3),
    "cancelada_em" TIMESTAMP(3),
    "cancelado_motivo" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mercado_assinaturas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mercado_assinaturas_tenant_id_status_proximo_ciclo_em_idx" ON "mercado_assinaturas"("tenant_id", "status", "proximo_ciclo_em");
CREATE INDEX "mercado_assinaturas_loja_id_status_idx" ON "mercado_assinaturas"("loja_id", "status");
CREATE INDEX "mercado_assinaturas_tutor_id_idx" ON "mercado_assinaturas"("tutor_id");

ALTER TABLE "mercado_assinaturas"
    ADD CONSTRAINT "mercado_assinaturas_loja_id_fkey" FOREIGN KEY ("loja_id") REFERENCES "mercado_lojas"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "mercado_assinaturas_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "mercado_assinaturas_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Itens da assinatura ──────────────────────────────────────────────────────
CREATE TABLE "mercado_assinatura_itens" (
    "id" TEXT NOT NULL,
    "assinatura_id" TEXT NOT NULL,
    "produto_id" TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mercado_assinatura_itens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mercado_assinatura_itens_assinatura_id_produto_id_key" ON "mercado_assinatura_itens"("assinatura_id", "produto_id");
CREATE INDEX "mercado_assinatura_itens_produto_id_idx" ON "mercado_assinatura_itens"("produto_id");

ALTER TABLE "mercado_assinatura_itens"
    ADD CONSTRAINT "mercado_assinatura_itens_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "mercado_assinaturas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    ADD CONSTRAINT "mercado_assinatura_itens_produto_id_fkey" FOREIGN KEY ("produto_id") REFERENCES "mercado_produtos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Pedido gerado por ciclo ──────────────────────────────────────────────────
ALTER TABLE "mercado_pedidos" ADD COLUMN "assinatura_id" TEXT;
CREATE INDEX "mercado_pedidos_assinatura_id_idx" ON "mercado_pedidos"("assinatura_id");
ALTER TABLE "mercado_pedidos"
    ADD CONSTRAINT "mercado_pedidos_assinatura_id_fkey" FOREIGN KEY ("assinatura_id") REFERENCES "mercado_assinaturas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
