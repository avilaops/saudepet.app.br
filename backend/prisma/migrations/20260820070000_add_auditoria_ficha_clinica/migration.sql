-- Ficha clínica do pet passa a ser corrigível e removível — de forma auditável.
--
-- Até aqui alergia, vacina e medicação só nasciam no fechamento do atendimento
-- (`PUT /solicitacoes/:id/finalizar`) e nunca mais podiam ser tocadas: um "V10"
-- digitado no pet errado, ou uma alergia lançada por engano, só saía com UPDATE
-- na mão no banco. Como é dado clínico, nada é apagado de verdade: a remoção é
-- lógica (`ativo = false`) e carrega quem removeu, quando e por quê; a correção
-- carrega quem alterou e quando. O evento completo (estado anterior/posterior)
-- vai para `audit_logs` pelo AuditService.
--
-- Aditiva por construção: as linhas existentes nascem `ativo = true` e continuam
-- visíveis em toda leitura, que agora filtra por esse campo.

ALTER TABLE "pets_alergias" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pets_alergias" ADD COLUMN "removido_em" TIMESTAMP(3);
ALTER TABLE "pets_alergias" ADD COLUMN "removido_por" TEXT;
ALTER TABLE "pets_alergias" ADD COLUMN "motivo_remocao" TEXT;
ALTER TABLE "pets_alergias" ADD COLUMN "atualizado_em" TIMESTAMP(3);
ALTER TABLE "pets_alergias" ADD COLUMN "atualizado_por" TEXT;

ALTER TABLE "pets_vacinas" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pets_vacinas" ADD COLUMN "removido_em" TIMESTAMP(3);
ALTER TABLE "pets_vacinas" ADD COLUMN "removido_por" TEXT;
ALTER TABLE "pets_vacinas" ADD COLUMN "motivo_remocao" TEXT;
ALTER TABLE "pets_vacinas" ADD COLUMN "atualizado_em" TIMESTAMP(3);
ALTER TABLE "pets_vacinas" ADD COLUMN "atualizado_por" TEXT;

ALTER TABLE "pets_medicamentos" ADD COLUMN "ativo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pets_medicamentos" ADD COLUMN "removido_em" TIMESTAMP(3);
ALTER TABLE "pets_medicamentos" ADD COLUMN "removido_por" TEXT;
ALTER TABLE "pets_medicamentos" ADD COLUMN "motivo_remocao" TEXT;
ALTER TABLE "pets_medicamentos" ADD COLUMN "atualizado_em" TIMESTAMP(3);
ALTER TABLE "pets_medicamentos" ADD COLUMN "atualizado_por" TEXT;

-- Toda leitura da ficha é "o que vale hoje para este pet": o índice existente
-- (tenant_id, pet_id) ganha o recorte por `ativo` para não varrer removidos.
CREATE INDEX "pets_alergias_tenant_id_pet_id_ativo_idx" ON "pets_alergias"("tenant_id", "pet_id", "ativo");
CREATE INDEX "pets_vacinas_tenant_id_pet_id_ativo_idx" ON "pets_vacinas"("tenant_id", "pet_id", "ativo");
CREATE INDEX "pets_medicamentos_tenant_id_pet_id_ativo_idx" ON "pets_medicamentos"("tenant_id", "pet_id", "ativo");
