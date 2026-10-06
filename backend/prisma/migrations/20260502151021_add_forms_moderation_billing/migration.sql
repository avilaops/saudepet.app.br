-- CreateEnum
CREATE TYPE "TipoFormulario" AS ENUM ('pre_consulta', 'anamnese', 'pos_consulta', 'cadastro_pet', 'termo_consentimento', 'custom');

-- CreateEnum
CREATE TYPE "StatusFormulario" AS ENUM ('ativo', 'inativo', 'arquivado');

-- CreateEnum
CREATE TYPE "TipoViolacao" AS ENUM ('spam', 'abuso_verbal', 'assedio', 'conteudo_inapropriado', 'fraude', 'informacao_falsa', 'violacao_termos', 'other');

-- CreateEnum
CREATE TYPE "StatusViolacao" AS ENUM ('pendente', 'em_analise', 'confirmada', 'rejeitada', 'resolvida');

-- CreateEnum
CREATE TYPE "TipoPunicao" AS ENUM ('advertencia', 'suspensao_temp', 'suspensao_perm', 'restricao_funcao');

-- CreateEnum
CREATE TYPE "TipoTransacao" AS ENUM ('pagamento_atendimento', 'assinatura_plano', 'comissao_plataforma', 'transferencia_vet', 'estorno', 'bonus');

-- CreateEnum
CREATE TYPE "StatusTransacao" AS ENUM ('pendente', 'processando', 'aprovada', 'concluida', 'falhou', 'cancelada', 'estornada');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('cartao_credito', 'cartao_debito', 'pix', 'boleto', 'saldo_wallet');

-- DropIndex
DROP INDEX "mensagens_atendimento_id_idx";

-- DropIndex
DROP INDEX "mensagens_tenant_id_idx";

-- AlterTable
ALTER TABLE "mensagens" ADD COLUMN     "arquivada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deletada_em" TIMESTAMP(3),
ADD COLUMN     "editada_em" TIMESTAMP(3),
ADD COLUMN     "lida_em" TIMESTAMP(3),
ADD COLUMN     "metadados" TEXT,
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'texto';

-- CreateTable
CREATE TABLE "formularios" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo" "TipoFormulario" NOT NULL,
    "status" "StatusFormulario" NOT NULL DEFAULT 'ativo',
    "campos" TEXT NOT NULL,
    "obrigatorio" BOOLEAN NOT NULL DEFAULT false,
    "criado_por" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formularios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "respostas_formulario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "formulario_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "atendimento_id" TEXT,
    "pet_id" TEXT,
    "respostas" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "respostas_formulario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "violacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "reportado_por" TEXT,
    "tipo" "TipoViolacao" NOT NULL,
    "status" "StatusViolacao" NOT NULL DEFAULT 'pendente',
    "descricao" TEXT NOT NULL,
    "evidencias" TEXT,
    "gravidade" INTEGER NOT NULL DEFAULT 1,
    "pontos" INTEGER NOT NULL DEFAULT 1,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analisado_em" TIMESTAMP(3),
    "analisado_por" TEXT,
    "resolucao" TEXT,

    CONSTRAINT "violacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "punicoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "violacao_id" TEXT NOT NULL,
    "tipo" "TipoPunicao" NOT NULL,
    "motivo" TEXT NOT NULL,
    "inicio_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termina_em" TIMESTAMP(3),
    "ativa" BOOLEAN NOT NULL DEFAULT true,
    "aplicada_por" TEXT NOT NULL,
    "revogada_em" TIMESTAMP(3),
    "revogada_por" TEXT,
    "motivo_revogacao" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "punicoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_moderacao_usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "total_violacoes" INTEGER NOT NULL DEFAULT 0,
    "total_pontos" INTEGER NOT NULL DEFAULT 0,
    "advertencias" INTEGER NOT NULL DEFAULT 0,
    "suspensoes_temp" INTEGER NOT NULL DEFAULT 0,
    "suspensoes_perm" INTEGER NOT NULL DEFAULT 0,
    "ultima_violacao_em" TIMESTAMP(3),
    "banido" BOOLEAN NOT NULL DEFAULT false,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historico_moderacao_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tipo" "TipoTransacao" NOT NULL,
    "status" "StatusTransacao" NOT NULL DEFAULT 'pendente',
    "valor_total" DECIMAL(10,2) NOT NULL,
    "valor_tutor" DECIMAL(10,2),
    "valor_veterinario" DECIMAL(10,2),
    "valor_plataforma" DECIMAL(10,2),
    "percentual_plataforma" DECIMAL(5,2) NOT NULL DEFAULT 15,
    "atendimento_id" TEXT,
    "tutor_id" TEXT,
    "veterinario_id" TEXT,
    "metodo_pagamento" "MetodoPagamento",
    "gateway_transacao_id" TEXT,
    "gateway_resposta" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processado_em" TIMESTAMP(3),
    "concluido_em" TIMESTAMP(3),
    "descricao" TEXT,
    "notas" TEXT,

    CONSTRAINT "transacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carteiras_tutor" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "saldo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_gasto" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carteiras_tutor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carteiras_veterinario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "saldo_disponivel" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "saldo_pendente" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_recebido" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "total_transferido" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dados_bancarios" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "carteiras_veterinario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planos_assinatura" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "descricao" TEXT,
    "tipo_usuario" TEXT NOT NULL,
    "valor_mensal" DECIMAL(10,2) NOT NULL,
    "limite_atendimentos" INTEGER,
    "beneficios" TEXT NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "planos_assinatura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assinaturas_usuario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "plano_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ativa',
    "valor_mensal" DECIMAL(10,2) NOT NULL,
    "inicio_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proxima_cobranca" TIMESTAMP(3) NOT NULL,
    "cancelada_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assinaturas_usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faturas" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "descricao" TEXT NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "vencimento" TIMESTAMP(3) NOT NULL,
    "paga_em" TIMESTAMP(3),
    "metodo_pagamento" "MetodoPagamento",
    "transacao_id" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faturas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historico_financeiro_tenant" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "total_transacoes" INTEGER NOT NULL DEFAULT 0,
    "total_faturado" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_comissao" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_transferido_vets" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "mes_referencia" TEXT NOT NULL,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "historico_financeiro_tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "formularios_tenant_id_idx" ON "formularios"("tenant_id");

-- CreateIndex
CREATE INDEX "formularios_tenant_id_tipo_idx" ON "formularios"("tenant_id", "tipo");

-- CreateIndex
CREATE INDEX "formularios_tenant_id_status_idx" ON "formularios"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "respostas_formulario_tenant_id_idx" ON "respostas_formulario"("tenant_id");

-- CreateIndex
CREATE INDEX "respostas_formulario_formulario_id_idx" ON "respostas_formulario"("formulario_id");

-- CreateIndex
CREATE INDEX "respostas_formulario_usuario_id_idx" ON "respostas_formulario"("usuario_id");

-- CreateIndex
CREATE INDEX "respostas_formulario_atendimento_id_idx" ON "respostas_formulario"("atendimento_id");

-- CreateIndex
CREATE INDEX "respostas_formulario_criado_em_idx" ON "respostas_formulario"("criado_em");

-- CreateIndex
CREATE INDEX "violacoes_tenant_id_idx" ON "violacoes"("tenant_id");

-- CreateIndex
CREATE INDEX "violacoes_usuario_id_idx" ON "violacoes"("usuario_id");

-- CreateIndex
CREATE INDEX "violacoes_status_idx" ON "violacoes"("status");

-- CreateIndex
CREATE INDEX "violacoes_tipo_idx" ON "violacoes"("tipo");

-- CreateIndex
CREATE INDEX "violacoes_criado_em_idx" ON "violacoes"("criado_em");

-- CreateIndex
CREATE INDEX "punicoes_tenant_id_idx" ON "punicoes"("tenant_id");

-- CreateIndex
CREATE INDEX "punicoes_usuario_id_idx" ON "punicoes"("usuario_id");

-- CreateIndex
CREATE INDEX "punicoes_usuario_id_ativa_idx" ON "punicoes"("usuario_id", "ativa");

-- CreateIndex
CREATE INDEX "punicoes_termina_em_idx" ON "punicoes"("termina_em");

-- CreateIndex
CREATE INDEX "historico_moderacao_usuario_tenant_id_idx" ON "historico_moderacao_usuario"("tenant_id");

-- CreateIndex
CREATE INDEX "historico_moderacao_usuario_usuario_id_idx" ON "historico_moderacao_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "historico_moderacao_usuario_banido_idx" ON "historico_moderacao_usuario"("banido");

-- CreateIndex
CREATE UNIQUE INDEX "historico_moderacao_usuario_tenant_id_usuario_id_key" ON "historico_moderacao_usuario"("tenant_id", "usuario_id");

-- CreateIndex
CREATE INDEX "transacoes_tenant_id_idx" ON "transacoes"("tenant_id");

-- CreateIndex
CREATE INDEX "transacoes_tenant_id_status_idx" ON "transacoes"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "transacoes_atendimento_id_idx" ON "transacoes"("atendimento_id");

-- CreateIndex
CREATE INDEX "transacoes_tutor_id_idx" ON "transacoes"("tutor_id");

-- CreateIndex
CREATE INDEX "transacoes_veterinario_id_idx" ON "transacoes"("veterinario_id");

-- CreateIndex
CREATE INDEX "transacoes_criado_em_idx" ON "transacoes"("criado_em");

-- CreateIndex
CREATE UNIQUE INDEX "carteiras_tutor_tutor_id_key" ON "carteiras_tutor"("tutor_id");

-- CreateIndex
CREATE INDEX "carteiras_tutor_tenant_id_idx" ON "carteiras_tutor"("tenant_id");

-- CreateIndex
CREATE INDEX "carteiras_tutor_tutor_id_idx" ON "carteiras_tutor"("tutor_id");

-- CreateIndex
CREATE UNIQUE INDEX "carteiras_veterinario_veterinario_id_key" ON "carteiras_veterinario"("veterinario_id");

-- CreateIndex
CREATE INDEX "carteiras_veterinario_tenant_id_idx" ON "carteiras_veterinario"("tenant_id");

-- CreateIndex
CREATE INDEX "carteiras_veterinario_veterinario_id_idx" ON "carteiras_veterinario"("veterinario_id");

-- CreateIndex
CREATE INDEX "planos_assinatura_tenant_id_idx" ON "planos_assinatura"("tenant_id");

-- CreateIndex
CREATE INDEX "planos_assinatura_ativo_idx" ON "planos_assinatura"("ativo");

-- CreateIndex
CREATE INDEX "assinaturas_usuario_tenant_id_idx" ON "assinaturas_usuario"("tenant_id");

-- CreateIndex
CREATE INDEX "assinaturas_usuario_usuario_id_idx" ON "assinaturas_usuario"("usuario_id");

-- CreateIndex
CREATE INDEX "assinaturas_usuario_plano_id_idx" ON "assinaturas_usuario"("plano_id");

-- CreateIndex
CREATE INDEX "assinaturas_usuario_status_idx" ON "assinaturas_usuario"("status");

-- CreateIndex
CREATE INDEX "assinaturas_usuario_proxima_cobranca_idx" ON "assinaturas_usuario"("proxima_cobranca");

-- CreateIndex
CREATE INDEX "faturas_tenant_id_idx" ON "faturas"("tenant_id");

-- CreateIndex
CREATE INDEX "faturas_usuario_id_idx" ON "faturas"("usuario_id");

-- CreateIndex
CREATE INDEX "faturas_status_idx" ON "faturas"("status");

-- CreateIndex
CREATE INDEX "faturas_vencimento_idx" ON "faturas"("vencimento");

-- CreateIndex
CREATE UNIQUE INDEX "historico_financeiro_tenant_tenant_id_key" ON "historico_financeiro_tenant"("tenant_id");

-- CreateIndex
CREATE INDEX "historico_financeiro_tenant_tenant_id_idx" ON "historico_financeiro_tenant"("tenant_id");

-- CreateIndex
CREATE INDEX "historico_financeiro_tenant_mes_referencia_idx" ON "historico_financeiro_tenant"("mes_referencia");

-- CreateIndex
CREATE INDEX "mensagens_tenant_id_criado_em_idx" ON "mensagens"("tenant_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "mensagens_remetente_id_criado_em_idx" ON "mensagens"("remetente_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "mensagens_destinatario_id_lida_criado_em_idx" ON "mensagens"("destinatario_id", "lida", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "mensagens_atendimento_id_criado_em_idx" ON "mensagens"("atendimento_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "mensagens_criado_em_idx" ON "mensagens"("criado_em");

-- AddForeignKey
ALTER TABLE "respostas_formulario" ADD CONSTRAINT "respostas_formulario_formulario_id_fkey" FOREIGN KEY ("formulario_id") REFERENCES "formularios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "punicoes" ADD CONSTRAINT "punicoes_violacao_id_fkey" FOREIGN KEY ("violacao_id") REFERENCES "violacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assinaturas_usuario" ADD CONSTRAINT "assinaturas_usuario_plano_id_fkey" FOREIGN KEY ("plano_id") REFERENCES "planos_assinatura"("id") ON DELETE CASCADE ON UPDATE CASCADE;
