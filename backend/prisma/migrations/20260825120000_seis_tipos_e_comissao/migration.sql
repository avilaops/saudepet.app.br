-- Os seis tipos de atendimento do plano, e a comissão saindo do código.
--
-- A vitrine oferecia três dos seis. Vacinação já tinha lastro clínico — a
-- aplicação é gravada em `pets_vacinas` e alimenta a carteira digital e a tag
-- da coleira; faltava poder pedir.
--
-- E o percentual da plataforma era constante no código (15%) enquanto o plano
-- diz 20. Vira coluna por cidade: mudar comissão não pode exigir deploy.
ALTER TYPE "TipoAtendimento" ADD VALUE IF NOT EXISTS 'vacinacao';
ALTER TYPE "TipoAtendimento" ADD VALUE IF NOT EXISTS 'avaliacao';
ALTER TYPE "TipoAtendimento" ADD VALUE IF NOT EXISTS 'consulta_rotina';

ALTER TABLE "cidades_cobertura"
  ADD COLUMN IF NOT EXISTS "preco_vacinacao" DECIMAL(10,2) NOT NULL DEFAULT 120.00,
  ADD COLUMN IF NOT EXISTS "preco_avaliacao" DECIMAL(10,2) NOT NULL DEFAULT 120.00,
  ADD COLUMN IF NOT EXISTS "preco_consulta_rotina" DECIMAL(10,2) NOT NULL DEFAULT 130.00,
  ADD COLUMN IF NOT EXISTS "percentual_plataforma" INTEGER NOT NULL DEFAULT 20;
