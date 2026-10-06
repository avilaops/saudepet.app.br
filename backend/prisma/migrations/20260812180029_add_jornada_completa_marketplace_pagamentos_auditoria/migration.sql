-- CreateEnum
CREATE TYPE "StatusCredenciamento" AS ENUM ('DRAFT', 'PENDING_DOCUMENTS', 'PENDING_REVIEW', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED', 'EXPIRED', 'REQUIRES_RESUBMISSION');

-- CreateEnum
CREATE TYPE "StatusFinanceiroVet" AS ENUM ('NOT_STARTED', 'PENDING_DATA', 'PENDING_PROVIDER', 'UNDER_REVIEW', 'ACTIVE', 'RESTRICTED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "BannerStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PartnerType" AS ENUM ('CLINIC', 'HOSPITAL', 'LABORATORY', 'DIAGNOSTIC_CENTER', 'PHARMACY', 'PET_SHOP', 'REHABILITATION', 'OTHER');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('CREATED', 'SENT', 'VIEWED', 'ACCEPTED', 'SCHEDULED', 'ATTENDED', 'PENDING_CONFIRMATION', 'CONVERTED', 'CANCELLED', 'EXPIRED', 'DISPUTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "CommissionType" AS ENUM ('PERCENTAGE', 'FIXED', 'PERCENTAGE_PLUS_FIXED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('OPEN', 'PENDING_REVIEW', 'APPROVED', 'DUE', 'PAID', 'OVERDUE', 'CANCELLED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED', 'PAID', 'FAILED', 'EXPIRED', 'CANCELLED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'CHARGEBACK', 'DISPUTED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD', 'BOLETO');

-- CreateTable
-- As 11 tabelas abaixo (ate lembretes_pet) ja existiam em ambientes que
-- passaram por "prisma db push" antes desta migration (dev local, producao).
-- Incluidas aqui explicitamente para que qualquer ambiente novo (banco de
-- teste, clone limpo do repo) tambem as receba corretamente via migrate deploy.
CREATE TABLE "tutores_onboarding" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "onboarding_concluido" BOOLEAN NOT NULL DEFAULT false,
    "passo_atual" INTEGER NOT NULL DEFAULT 1,
    "tutorial_visto" BOOLEAN NOT NULL DEFAULT false,
    "concluido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tutores_onboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dicas_saude_pet" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "conteudo" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "especie_alvo" TEXT,
    "imagem_url" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "publicado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dicas_saude_pet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets_vacinas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "nome_vacina" TEXT NOT NULL,
    "laboratorio" TEXT,
    "lote" TEXT,
    "data_aplicacao" TIMESTAMP(3) NOT NULL,
    "proxima_dose" TIMESTAMP(3),
    "veterinario_nome" TEXT,
    "comprovante_url" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pets_vacinas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets_medicamentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "nome_medicamento" TEXT NOT NULL,
    "dosagem" TEXT NOT NULL,
    "frequencia_horas" INTEGER NOT NULL,
    "uso_continuo" BOOLEAN NOT NULL DEFAULT false,
    "data_inicio" TIMESTAMP(3) NOT NULL,
    "data_fim" TIMESTAMP(3),
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pets_medicamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pets_alergias" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "alergia" TEXT NOT NULL,
    "gravidade" TEXT NOT NULL DEFAULT 'moderada',
    "observacoes" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pets_alergias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_timeline" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "status" "StatusAtendimento" NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "observacao" TEXT,
    "registrado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_timeline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_anexos" (
    "id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'foto',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitacoes_anexos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prontuarios_eletronicos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "queixa_principal" TEXT NOT NULL,
    "exame_fisico" TEXT,
    "hipotese_diagnostica" TEXT NOT NULL,
    "diagnostico_definitivo" TEXT,
    "orientacoes_tutor" TEXT,
    "retorno_sugerido_em" TIMESTAMP(3),
    "pdf_prontuario_url" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prontuarios_eletronicos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescricoes_itens" (
    "id" TEXT NOT NULL,
    "prontuario_id" TEXT NOT NULL,
    "medicamento" TEXT NOT NULL,
    "concentracao" TEXT,
    "forma_farmacia" TEXT,
    "posologia" TEXT NOT NULL,
    "duracao_dias" INTEGER,

    CONSTRAINT "prescricoes_itens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitacoes_exames" (
    "id" TEXT NOT NULL,
    "prontuario_id" TEXT NOT NULL,
    "nome_exame" TEXT NOT NULL,
    "justificativa" TEXT,

    CONSTRAINT "solicitacoes_exames_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lembretes_pet" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "data_lembrete" TIMESTAMP(3) NOT NULL,
    "concluido" BOOLEAN NOT NULL DEFAULT false,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lembretes_pet_pkey" PRIMARY KEY ("id")
);

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatusAtendimento" ADD VALUE 'criado';
ALTER TYPE "StatusAtendimento" ADD VALUE 'oferta_enviada';
ALTER TYPE "StatusAtendimento" ADD VALUE 'aceito';
ALTER TYPE "StatusAtendimento" ADD VALUE 'sem_veterinario';
ALTER TYPE "StatusAtendimento" ADD VALUE 'expirado';
ALTER TYPE "StatusAtendimento" ADD VALUE 'recusado';
ALTER TYPE "StatusAtendimento" ADD VALUE 'cancelado_tutor';
ALTER TYPE "StatusAtendimento" ADD VALUE 'cancelado_vet';
ALTER TYPE "StatusAtendimento" ADD VALUE 'cancelado_admin';
ALTER TYPE "StatusAtendimento" ADD VALUE 'pagamento_falhou';
ALTER TYPE "StatusAtendimento" ADD VALUE 'contestado';

-- DropIndex
DROP INDEX "usuarios_tenant_id_facebook_id_key";

-- DropIndex
DROP INDEX "usuarios_tenant_id_telefone_key";

-- AlterTable
ALTER TABLE "audit_logs" ADD COLUMN     "actor_role" TEXT,
ADD COLUMN     "entity_id" TEXT,
ADD COLUMN     "entity_type" TEXT,
ADD COLUMN     "estado_anterior" JSONB,
ADD COLUMN     "estado_posterior" JSONB,
ADD COLUMN     "motivo" TEXT,
ADD COLUMN     "request_id" TEXT;

-- AlterTable
ALTER TABLE "pets" ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "castrado" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "data_nascimento" TIMESTAMP(3),
ADD COLUMN     "especie" TEXT,
ADD COLUMN     "microchip" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "porte" TEXT,
ADD COLUMN     "rga" TEXT,
ADD COLUMN     "sexo" TEXT,
ALTER COLUMN "tipo" DROP NOT NULL;

-- AlterTable
ALTER TABLE "solicitacoes" ADD COLUMN     "latitude_vet" DOUBLE PRECISION,
ADD COLUMN     "longitude_vet" DOUBLE PRECISION,
ADD COLUMN     "motivo_cancelamento" TEXT,
ADD COLUMN     "oferta_vence_em" TIMESTAMP(3),
ADD COLUMN     "prontuario_pdf_url" TEXT,
ADD COLUMN     "receita_pdf_url" TEXT,
ADD COLUMN     "ultimo_ping_vet" TIMESTAMP(3);

-- AlterTable
-- facebook_id NAO é dropado aqui de propósito — isso acontece mais abaixo,
-- depois que auth_identities existir e os dados forem migrados para lá.
ALTER TABLE "usuarios"
ADD COLUMN     "ativo" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "avatar" TEXT,
ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "cpf" TEXT,
ADD COLUMN     "data_ultimo_acesso" TIMESTAMP(3),
ADD COLUMN     "endereco" TEXT,
ADD COLUMN     "estado" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "preferencias" TEXT,
ADD COLUMN     "primeiro_acesso" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "senha_hash" TEXT,
ALTER COLUMN "telefone" DROP NOT NULL,
ALTER COLUMN "senha" DROP NOT NULL,
ALTER COLUMN "tipo_usuario" SET DEFAULT 'tutor',
ALTER COLUMN "cidade" DROP NOT NULL;

-- AlterTable
ALTER TABLE "veterinarios" ADD COLUMN     "asaas_account_id" TEXT,
ADD COLUMN     "asaas_wallet_id" TEXT,
ADD COLUMN     "dados_bancarios" TEXT,
ADD COLUMN     "decidido_em" TIMESTAMP(3),
ADD COLUMN     "decidido_por_id" TEXT,
ADD COLUMN     "diploma_url" TEXT,
ADD COLUMN     "documento_identidade_url" TEXT,
ADD COLUMN     "habilita_split" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "habilitado_em" TIMESTAMP(3),
ADD COLUMN     "motivo_decisao" TEXT,
ADD COLUMN     "observacao_interna" TEXT,
ADD COLUMN     "provider_financeiro" TEXT DEFAULT 'asaas',
ADD COLUMN     "status_credenciamento" "StatusCredenciamento" NOT NULL DEFAULT 'PENDING_REVIEW',
ADD COLUMN     "status_financeiro" "StatusFinanceiroVet" NOT NULL DEFAULT 'NOT_STARTED',
ADD COLUMN     "ultimo_ping_online" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "auth_identities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_user_id" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_identities_pkey" PRIMARY KEY ("id")
);

-- DataMigration
-- Preserva o vínculo de login social de quem já usa Facebook antes de
-- dropar a coluna: cada usuario.facebook_id vira uma linha em auth_identities
-- (provider='facebook'), que é o que o auth.controller.js reescrito passa
-- a consultar (ver commit "adiciona login social com Google OAuth e
-- reescreve Facebook Login"). Sem isso, quem logava via Facebook perderia
-- o vínculo e precisaria recriar conta ao tentar logar de novo.
INSERT INTO "auth_identities" ("id", "tenant_id", "usuario_id", "provider", "provider_user_id", "criado_em")
SELECT gen_random_uuid()::text, "tenant_id", "id", 'facebook', "facebook_id", CURRENT_TIMESTAMP
FROM "usuarios"
WHERE "facebook_id" IS NOT NULL AND "tenant_id" IS NOT NULL;

-- AlterTable
ALTER TABLE "usuarios" DROP COLUMN "facebook_id";

-- CreateTable
CREATE TABLE "auth_exchange_codes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_exchange_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veterinarios_submissoes" (
    "id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "documento_url" TEXT,
    "diploma_url" TEXT,
    "documento_identidade_url" TEXT,
    "documento_analise" JSONB,
    "motivo" TEXT,
    "observacao_admin" TEXT,
    "decidido_por_id" TEXT,
    "decidido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "veterinarios_submissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "landing_banners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "altText" TEXT NOT NULL,
    "desktopImageUrl" TEXT NOT NULL,
    "mobileImageUrl" TEXT,
    "targetUrl" TEXT,
    "buttonLabel" TEXT,
    "status" "BannerStatus" NOT NULL DEFAULT 'DRAFT',
    "position" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "landing_banners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banner_audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bannerId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "bannerTitle" TEXT NOT NULL,
    "performedById" TEXT NOT NULL,
    "performedByName" TEXT NOT NULL,
    "userIp" TEXT,
    "previousVersion" TEXT,
    "newVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "banner_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partners" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT NOT NULL,
    "documentNumber" TEXT NOT NULL,
    "partnerType" "PartnerType" NOT NULL DEFAULT 'CLINIC',
    "description" TEXT,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "whatsapp" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "status" "PartnerStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "approvalStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "suspendedAt" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_units" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "whatsapp" TEXT,
    "addressLine" TEXT NOT NULL,
    "addressNumber" TEXT NOT NULL,
    "complement" TEXT,
    "district" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "openingHours" TEXT,
    "emergencyService" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_services" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerUnitId" TEXT,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "publicPrice" DECIMAL(10,2) NOT NULL,
    "priceType" TEXT NOT NULL DEFAULT 'FIXED',
    "requiresScheduling" BOOLEAN NOT NULL DEFAULT true,
    "estimatedDuration" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_rules" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partnerId" TEXT,
    "partnerUnitId" TEXT,
    "partnerServiceId" TEXT,
    "name" TEXT NOT NULL,
    "calculationType" "CommissionType" NOT NULL DEFAULT 'PERCENTAGE',
    "percentage" DECIMAL(5,2) NOT NULL DEFAULT 10.00,
    "fixedAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "minimumCommission" DECIMAL(10,2),
    "maximumCommission" DECIMAL(10,2),
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referrals" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "referralCode" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "petId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerUnitId" TEXT NOT NULL,
    "partnerServiceId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'APP_TUTOR',
    "reason" TEXT,
    "status" "ReferralStatus" NOT NULL DEFAULT 'CREATED',
    "qrCodePayload" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "attendedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_conversions" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "eligibleAmount" DECIMAL(10,2) NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    "commissionTypeSnapshot" TEXT NOT NULL,
    "commissionPercentageSnapshot" DECIMAL(5,2) NOT NULL,
    "commissionFixedSnapshot" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "partnerNetAmount" DECIMAL(10,2) NOT NULL,
    "confirmedBy" TEXT NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'CONFIRMED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "referral_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commission_settlements" (
    "id" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "commissionAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'OPEN',
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "paymentReference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "commission_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_reviews" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "tutorId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partner_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partner_users" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "partnerUnitId" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partner_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "referral_documents" (
    "id" TEXT NOT NULL,
    "referralId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL DEFAULT 'VOUCHER',
    "fileUrl" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "referral_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT,
    "tutor_id" TEXT NOT NULL,
    "veterinario_id" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'asaas',
    "external_payment_id" TEXT,
    "idempotency_key" TEXT,
    "method" "PaymentMethod" NOT NULL DEFAULT 'PIX',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "status" "StatusPagamento" NOT NULL DEFAULT 'CREATED',
    "pix_copy_paste" TEXT,
    "pix_qr_code_ref" TEXT,
    "card_last_four" TEXT,
    "card_brand" TEXT,
    "installments" INTEGER DEFAULT 1,
    "expires_at" TIMESTAMP(3),
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "refunded_at" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_splits" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "recipient_type" TEXT NOT NULL,
    "recipient_id" TEXT,
    "provider_recipient_id" TEXT,
    "gross_amount" DECIMAL(10,2) NOT NULL,
    "gateway_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "platform_fee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "recipient_amount" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "external_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_hash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processing_status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "external_refund_id" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "requested_by" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agendas_disponiveis" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "dia_semana" INTEGER NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fim" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendas_disponiveis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cidades_cobertura" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "estado" TEXT NOT NULL,
    "raio_atendimento_km" INTEGER NOT NULL DEFAULT 20,
    "preco_emergencia" DECIMAL(10,2) NOT NULL DEFAULT 150.00,
    "preco_domiciliar" DECIMAL(10,2) NOT NULL DEFAULT 150.00,
    "preco_teleorientacao" DECIMAL(10,2) NOT NULL DEFAULT 80.00,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cidades_cobertura_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_identities_usuario_id_idx" ON "auth_identities"("usuario_id");

-- CreateIndex
CREATE INDEX "auth_identities_tenant_id_idx" ON "auth_identities"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_identities_tenant_id_provider_provider_user_id_key" ON "auth_identities"("tenant_id", "provider", "provider_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_exchange_codes_code_hash_key" ON "auth_exchange_codes"("code_hash");

-- CreateIndex
CREATE INDEX "auth_exchange_codes_code_hash_idx" ON "auth_exchange_codes"("code_hash");

-- CreateIndex
CREATE INDEX "auth_exchange_codes_usuario_id_idx" ON "auth_exchange_codes"("usuario_id");

-- CreateIndex
CREATE INDEX "veterinarios_submissoes_veterinario_id_idx" ON "veterinarios_submissoes"("veterinario_id");

-- CreateIndex
CREATE INDEX "landing_banners_tenantId_status_position_idx" ON "landing_banners"("tenantId", "status", "position");

-- CreateIndex
CREATE INDEX "banner_audit_logs_tenantId_bannerId_idx" ON "banner_audit_logs"("tenantId", "bannerId");

-- CreateIndex
CREATE INDEX "banner_audit_logs_createdAt_idx" ON "banner_audit_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "partners_documentNumber_key" ON "partners"("documentNumber");

-- CreateIndex
CREATE INDEX "partners_tenantId_status_partnerType_idx" ON "partners"("tenantId", "status", "partnerType");

-- CreateIndex
CREATE INDEX "partner_units_partnerId_city_state_idx" ON "partner_units"("partnerId", "city", "state");

-- CreateIndex
CREATE UNIQUE INDEX "partner_categories_slug_key" ON "partner_categories"("slug");

-- CreateIndex
CREATE INDEX "partner_services_partnerId_categoryId_idx" ON "partner_services"("partnerId", "categoryId");

-- CreateIndex
CREATE INDEX "commission_rules_tenantId_partnerId_active_idx" ON "commission_rules"("tenantId", "partnerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "referrals_referralCode_key" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referrals_tenantId_tutorId_idx" ON "referrals"("tenantId", "tutorId");

-- CreateIndex
CREATE INDEX "referrals_partnerId_status_idx" ON "referrals"("partnerId", "status");

-- CreateIndex
CREATE INDEX "referrals_referralCode_idx" ON "referrals"("referralCode");

-- CreateIndex
CREATE INDEX "referral_conversions_referralId_idx" ON "referral_conversions"("referralId");

-- CreateIndex
CREATE INDEX "commission_settlements_partnerId_status_idx" ON "commission_settlements"("partnerId", "status");

-- CreateIndex
CREATE INDEX "partner_reviews_partnerId_idx" ON "partner_reviews"("partnerId");

-- CreateIndex
CREATE INDEX "partner_users_userId_partnerId_idx" ON "partner_users"("userId", "partnerId");

-- CreateIndex
CREATE INDEX "referral_documents_referralId_idx" ON "referral_documents"("referralId");

-- CreateIndex
CREATE UNIQUE INDEX "payments_external_payment_id_key" ON "payments"("external_payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_tenant_id_idx" ON "payments"("tenant_id");

-- CreateIndex
CREATE INDEX "payments_tutor_id_idx" ON "payments"("tutor_id");

-- CreateIndex
CREATE INDEX "payments_veterinario_id_idx" ON "payments"("veterinario_id");

-- CreateIndex
CREATE INDEX "payments_atendimento_id_idx" ON "payments"("atendimento_id");

-- CreateIndex
CREATE INDEX "payments_status_idx" ON "payments"("status");

-- CreateIndex
CREATE INDEX "payments_external_payment_id_idx" ON "payments"("external_payment_id");

-- CreateIndex
CREATE INDEX "payment_splits_payment_id_idx" ON "payment_splits"("payment_id");

-- CreateIndex
CREATE INDEX "payment_splits_recipient_id_idx" ON "payment_splits"("recipient_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_external_event_id_key" ON "payment_events"("external_event_id");

-- CreateIndex
CREATE INDEX "payment_events_provider_external_event_id_idx" ON "payment_events"("provider", "external_event_id");

-- CreateIndex
CREATE INDEX "payment_events_processing_status_idx" ON "payment_events"("processing_status");

-- CreateIndex
CREATE UNIQUE INDEX "refunds_external_refund_id_key" ON "refunds"("external_refund_id");

-- CreateIndex
CREATE INDEX "refunds_payment_id_idx" ON "refunds"("payment_id");

-- CreateIndex
CREATE INDEX "agendas_disponiveis_tenant_id_veterinario_id_dia_semana_idx" ON "agendas_disponiveis"("tenant_id", "veterinario_id", "dia_semana");

-- CreateIndex
CREATE INDEX "cidades_cobertura_tenant_id_ativo_idx" ON "cidades_cobertura"("tenant_id", "ativo");

-- CreateIndex
CREATE UNIQUE INDEX "cidades_cobertura_tenant_id_nome_estado_key" ON "cidades_cobertura"("tenant_id", "nome", "estado");

-- CreateIndex
CREATE INDEX "audit_logs_recurso_recurso_id_idx" ON "audit_logs"("recurso", "recurso_id");

-- CreateIndex
CREATE INDEX "usuarios_tipo_usuario_idx" ON "usuarios"("tipo_usuario");

-- CreateIndex
CREATE INDEX "veterinarios_status_credenciamento_idx" ON "veterinarios"("status_credenciamento");

-- CreateIndex
CREATE INDEX "veterinarios_status_financeiro_idx" ON "veterinarios"("status_financeiro");

-- AddForeignKey
ALTER TABLE "auth_identities" ADD CONSTRAINT "auth_identities_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_exchange_codes" ADD CONSTRAINT "auth_exchange_codes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veterinarios_submissoes" ADD CONSTRAINT "veterinarios_submissoes_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "banner_audit_logs" ADD CONSTRAINT "banner_audit_logs_bannerId_fkey" FOREIGN KEY ("bannerId") REFERENCES "landing_banners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_units" ADD CONSTRAINT "partner_units_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_partnerUnitId_fkey" FOREIGN KEY ("partnerUnitId") REFERENCES "partner_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_services" ADD CONSTRAINT "partner_services_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "partner_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_rules" ADD CONSTRAINT "commission_rules_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partnerUnitId_fkey" FOREIGN KEY ("partnerUnitId") REFERENCES "partner_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referrals" ADD CONSTRAINT "referrals_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "partner_services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_conversions" ADD CONSTRAINT "referral_conversions_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commission_settlements" ADD CONSTRAINT "commission_settlements_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_reviews" ADD CONSTRAINT "partner_reviews_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_reviews" ADD CONSTRAINT "partner_reviews_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partner_users" ADD CONSTRAINT "partner_users_partnerUnitId_fkey" FOREIGN KEY ("partnerUnitId") REFERENCES "partner_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "referral_documents" ADD CONSTRAINT "referral_documents_referralId_fkey" FOREIGN KEY ("referralId") REFERENCES "referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_splits" ADD CONSTRAINT "payment_splits_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agendas_disponiveis" ADD CONSTRAINT "agendas_disponiveis_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "tutores_onboarding_tenant_id_idx" ON "tutores_onboarding"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tutores_onboarding_tenant_id_tutor_id_key" ON "tutores_onboarding"("tenant_id", "tutor_id");

-- CreateIndex
CREATE INDEX "dicas_saude_pet_tenant_id_ativo_publicado_em_idx" ON "dicas_saude_pet"("tenant_id", "ativo", "publicado_em");

-- CreateIndex
CREATE INDEX "pets_vacinas_tenant_id_pet_id_idx" ON "pets_vacinas"("tenant_id", "pet_id");

-- CreateIndex
CREATE INDEX "pets_vacinas_proxima_dose_idx" ON "pets_vacinas"("proxima_dose");

-- CreateIndex
CREATE INDEX "pets_medicamentos_tenant_id_pet_id_idx" ON "pets_medicamentos"("tenant_id", "pet_id");

-- CreateIndex
CREATE INDEX "pets_alergias_tenant_id_pet_id_idx" ON "pets_alergias"("tenant_id", "pet_id");

-- CreateIndex
CREATE INDEX "solicitacoes_timeline_tenant_id_atendimento_id_registrado_e_idx" ON "solicitacoes_timeline"("tenant_id", "atendimento_id", "registrado_em");

-- CreateIndex
CREATE INDEX "solicitacoes_anexos_atendimento_id_idx" ON "solicitacoes_anexos"("atendimento_id");

-- CreateIndex
CREATE UNIQUE INDEX "prontuarios_eletronicos_atendimento_id_key" ON "prontuarios_eletronicos"("atendimento_id");

-- CreateIndex
CREATE INDEX "prontuarios_eletronicos_tenant_id_pet_id_idx" ON "prontuarios_eletronicos"("tenant_id", "pet_id");

-- CreateIndex
CREATE INDEX "prontuarios_eletronicos_veterinario_id_idx" ON "prontuarios_eletronicos"("veterinario_id");

-- CreateIndex
CREATE INDEX "lembretes_pet_tenant_id_tutor_id_idx" ON "lembretes_pet"("tenant_id", "tutor_id");

-- CreateIndex
CREATE INDEX "lembretes_pet_pet_id_idx" ON "lembretes_pet"("pet_id");

-- CreateIndex
CREATE INDEX "lembretes_pet_data_lembrete_concluido_idx" ON "lembretes_pet"("data_lembrete", "concluido");

-- AddForeignKey
ALTER TABLE "tutores_onboarding" ADD CONSTRAINT "tutores_onboarding_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets_vacinas" ADD CONSTRAINT "pets_vacinas_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets_medicamentos" ADD CONSTRAINT "pets_medicamentos_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pets_alergias" ADD CONSTRAINT "pets_alergias_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_timeline" ADD CONSTRAINT "solicitacoes_timeline_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_anexos" ADD CONSTRAINT "solicitacoes_anexos_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prontuarios_eletronicos" ADD CONSTRAINT "prontuarios_eletronicos_atendimento_id_fkey" FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prontuarios_eletronicos" ADD CONSTRAINT "prontuarios_eletronicos_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prontuarios_eletronicos" ADD CONSTRAINT "prontuarios_eletronicos_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescricoes_itens" ADD CONSTRAINT "prescricoes_itens_prontuario_id_fkey" FOREIGN KEY ("prontuario_id") REFERENCES "prontuarios_eletronicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitacoes_exames" ADD CONSTRAINT "solicitacoes_exames_prontuario_id_fkey" FOREIGN KEY ("prontuario_id") REFERENCES "prontuarios_eletronicos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lembretes_pet" ADD CONSTRAINT "lembretes_pet_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
