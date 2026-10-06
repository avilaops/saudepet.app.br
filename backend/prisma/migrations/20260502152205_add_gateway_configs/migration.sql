-- CreateEnum
CREATE TYPE "GatewayTipo" AS ENUM ('stripe', 'mercado_pago', 'paypal');

-- CreateEnum
CREATE TYPE "AmbienteGateway" AS ENUM ('sandbox', 'production');

-- CreateTable
CREATE TABLE "gateway_configs" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "gateway" "GatewayTipo" NOT NULL,
    "ambiente" "AmbienteGateway" NOT NULL DEFAULT 'sandbox',
    "public_key_encrypted" TEXT,
    "secret_key_encrypted" TEXT NOT NULL,
    "webhook_secret_encrypted" TEXT,
    "configuracao_extra" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "testado_em" TIMESTAMP(3),
    "ultimo_erro" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gateway_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gateway_configs_tenant_id_idx" ON "gateway_configs"("tenant_id");

-- CreateIndex
CREATE INDEX "gateway_configs_gateway_idx" ON "gateway_configs"("gateway");

-- CreateIndex
CREATE INDEX "gateway_configs_ativo_idx" ON "gateway_configs"("ativo");

-- CreateIndex
CREATE UNIQUE INDEX "gateway_configs_tenant_id_gateway_key" ON "gateway_configs"("tenant_id", "gateway");
