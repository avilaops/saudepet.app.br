-- CRM do veterinário: clientela, agendamento futuro e retenção.
--
-- Migration aditiva: cria duas tabelas novas e acrescenta duas colunas
-- opcionais em `lembretes_pet`. Nenhuma coluna existente muda de tipo e nada é
-- apagado, então o backend antigo continua funcionando enquanto o novo sobe.

-- ── Agendamento de consulta futura ──────────────────────────────────────────
CREATE TYPE "StatusAgendamento" AS ENUM ('pendente', 'confirmado', 'cancelado', 'concluido', 'nao_compareceu');

CREATE TABLE "agendamentos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "pet_id" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL,
    "fim" TIMESTAMP(3) NOT NULL,
    "tipo_atendimento" "TipoAtendimento" NOT NULL,
    "status" "StatusAgendamento" NOT NULL DEFAULT 'pendente',
    "observacoes" TEXT,
    "motivo_cancelamento" TEXT,
    "cancelado_por_id" TEXT,
    "solicitacao_id" TEXT,
    "criado_por_id" TEXT NOT NULL,
    "lembrete_enviado" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agendamentos_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agendamentos_solicitacao_id_key" ON "agendamentos"("solicitacao_id");
-- Índice que sustenta a checagem de conflito de horário do vet.
CREATE INDEX "agendamentos_tenant_id_veterinario_id_inicio_idx" ON "agendamentos"("tenant_id", "veterinario_id", "inicio");
CREATE INDEX "agendamentos_tenant_id_tutor_id_idx" ON "agendamentos"("tenant_id", "tutor_id");
-- Usado pelo worker que avisa o agendamento do dia seguinte.
CREATE INDEX "agendamentos_status_inicio_idx" ON "agendamentos"("status", "inicio");

ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_pet_id_fkey" FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agendamentos" ADD CONSTRAINT "agendamentos_solicitacao_id_fkey" FOREIGN KEY ("solicitacao_id") REFERENCES "solicitacoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Ficha comercial do cliente (privada por veterinário) ────────────────────
CREATE TABLE "clientes_veterinario" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "veterinario_id" TEXT NOT NULL,
    "tutor_id" TEXT NOT NULL,
    "notas_privadas" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apelido" TEXT,
    "favorito" BOOLEAN NOT NULL DEFAULT false,
    "total_atendimentos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_atendimento" TIMESTAMP(3),
    "valor_total" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_veterinario_pkey" PRIMARY KEY ("id")
);

-- A ficha é por (vet, tutor): dois vets do mesmo tenant mantêm anotações
-- independentes sobre o mesmo tutor, e nenhum enxerga a do outro.
CREATE UNIQUE INDEX "clientes_veterinario_veterinario_id_tutor_id_key" ON "clientes_veterinario"("veterinario_id", "tutor_id");
CREATE INDEX "clientes_veterinario_tenant_id_veterinario_id_idx" ON "clientes_veterinario"("tenant_id", "veterinario_id");
CREATE INDEX "clientes_veterinario_tenant_id_veterinario_id_ultimo_atend_idx" ON "clientes_veterinario"("tenant_id", "veterinario_id", "ultimo_atendimento");

ALTER TABLE "clientes_veterinario" ADD CONSTRAINT "clientes_veterinario_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "clientes_veterinario" ADD CONSTRAINT "clientes_veterinario_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Lembrete passa a saber quem pediu o retorno ─────────────────────────────
-- Nulo nos lembretes que o tutor cria e nos que já existiam: sem isso o e-mail
-- de retorno saía assinado com a string literal "veterinário responsável".
ALTER TABLE "lembretes_pet" ADD COLUMN "veterinario_id" TEXT;
ALTER TABLE "lembretes_pet" ADD COLUMN "mensagem" TEXT;

CREATE INDEX "lembretes_pet_tenant_id_veterinario_id_idx" ON "lembretes_pet"("tenant_id", "veterinario_id");

ALTER TABLE "lembretes_pet" ADD CONSTRAINT "lembretes_pet_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Backfill da clientela a partir do histórico ─────────────────────────────
-- Sem isto o vet abriria o CRM vazio no primeiro acesso, mesmo tendo anos de
-- atendimento. Reconstrói a ficha a partir das solicitações já finalizadas.
INSERT INTO "clientes_veterinario" (
    "id", "tenant_id", "veterinario_id", "tutor_id",
    "total_atendimentos", "ultimo_atendimento", "criado_em", "atualizado_em"
)
SELECT
    gen_random_uuid(),
    s."tenant_id",
    s."veterinario_id",
    s."tutor_id",
    COUNT(*)::int,
    MAX(COALESCE(s."finalizado_em", s."atualizado_em")),
    NOW(),
    NOW()
FROM "solicitacoes" s
WHERE s."veterinario_id" IS NOT NULL
GROUP BY s."tenant_id", s."veterinario_id", s."tutor_id"
ON CONFLICT ("veterinario_id", "tutor_id") DO NOTHING;
