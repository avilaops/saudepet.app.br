/*
  Warnings:

  - A unique constraint covering the columns `[tenant_id,email]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenant_id,telefone]` on the table `usuarios` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenant_id,crmv]` on the table `veterinarios` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `tenant_id` to the `avaliacoes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `mensagens` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `pets` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `solicitacoes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenant_id` to the `veterinarios` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StatusTenant" AS ENUM ('ativo', 'suspenso', 'trial', 'cancelado');

-- CreateEnum
CREATE TYPE "PlanoTenant" AS ENUM ('free', 'basic', 'premium', 'enterprise');

-- AlterEnum
ALTER TYPE "TipoUsuario" ADD VALUE 'super_admin';

-- DropIndex
DROP INDEX "mensagens_remetente_id_destinatario_id_idx";

-- DropIndex
DROP INDEX "usuarios_email_key";

-- DropIndex
DROP INDEX "usuarios_telefone_key";

-- DropIndex
DROP INDEX "veterinarios_crmv_key";

-- AlterTable
ALTER TABLE "avaliacoes" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" ADD COLUMN     "tenant_id" TEXT;

-- AlterTable
ALTER TABLE "veterinarios" ADD COLUMN     "tenant_id" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "cnpj" TEXT,
    "email" TEXT NOT NULL,
    "telefone" TEXT NOT NULL,
    "endereco" TEXT,
    "cidade" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "logo" TEXT,
    "plano" "PlanoTenant" NOT NULL DEFAULT 'free',
    "status" "StatusTenant" NOT NULL DEFAULT 'trial',
    "limite_usuarios" INTEGER NOT NULL DEFAULT 10,
    "limite_pets" INTEGER NOT NULL DEFAULT 100,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    "expira_em" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracoes_tenant" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "permitir_cadastro" BOOLEAN NOT NULL DEFAULT true,
    "requer_aprovacao_vet" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes_email" BOOLEAN NOT NULL DEFAULT true,
    "notificacoes_sms" BOOLEAN NOT NULL DEFAULT false,
    "cor_primaria" TEXT NOT NULL DEFAULT '#3B82F6',
    "cor_secundaria" TEXT NOT NULL DEFAULT '#10B981',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_cnpj_key" ON "tenants"("cnpj");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE UNIQUE INDEX "configuracoes_tenant_tenant_id_key" ON "configuracoes_tenant"("tenant_id");

-- CreateIndex
CREATE INDEX "avaliacoes_tenant_id_idx" ON "avaliacoes"("tenant_id");

-- CreateIndex
CREATE INDEX "mensagens_tenant_id_idx" ON "mensagens"("tenant_id");

-- CreateIndex
CREATE INDEX "mensagens_tenant_id_remetente_id_destinatario_id_idx" ON "mensagens"("tenant_id", "remetente_id", "destinatario_id");

-- CreateIndex
CREATE INDEX "pets_tenant_id_idx" ON "pets"("tenant_id");

-- CreateIndex
CREATE INDEX "pets_tutor_id_idx" ON "pets"("tutor_id");

-- CreateIndex
CREATE INDEX "solicitacoes_tenant_id_idx" ON "solicitacoes"("tenant_id");

-- CreateIndex
CREATE INDEX "solicitacoes_tenant_id_status_idx" ON "solicitacoes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "solicitacoes_tenant_id_tutor_id_idx" ON "solicitacoes"("tenant_id", "tutor_id");

-- CreateIndex
CREATE INDEX "solicitacoes_tenant_id_veterinario_id_idx" ON "solicitacoes"("tenant_id", "veterinario_id");

-- CreateIndex
CREATE INDEX "usuarios_tenant_id_idx" ON "usuarios"("tenant_id");

-- CreateIndex
CREATE INDEX "usuarios_email_idx" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_email_key" ON "usuarios"("tenant_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_tenant_id_telefone_key" ON "usuarios"("tenant_id", "telefone");

-- CreateIndex
CREATE INDEX "veterinarios_tenant_id_idx" ON "veterinarios"("tenant_id");

-- CreateIndex
CREATE INDEX "veterinarios_tenant_id_online_idx" ON "veterinarios"("tenant_id", "online");

-- CreateIndex
CREATE UNIQUE INDEX "veterinarios_tenant_id_crmv_key" ON "veterinarios"("tenant_id", "crmv");

-- AddForeignKey
ALTER TABLE "configuracoes_tenant" ADD CONSTRAINT "configuracoes_tenant_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
