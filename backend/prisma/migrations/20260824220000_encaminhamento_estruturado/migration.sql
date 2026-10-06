-- Encaminhamento clínico com campos próprios.
--
-- Motivo e orientação eram escritos dentro de `diagnostico` e `receita` com o
-- prefixo `[EMERGÊNCIA]`: dava para exibir, não dava para consultar, contar nem
-- imprimir em seção própria. E a tela do tutor já lia um campo
-- `orientacao_encaminhamento` que nunca existiu — a orientação do veterinário
-- não chegava a ele.
--
-- Aditiva: três colunas opcionais.
ALTER TABLE "solicitacoes" ADD COLUMN IF NOT EXISTS "encaminhamento_motivo" TEXT;
ALTER TABLE "solicitacoes" ADD COLUMN IF NOT EXISTS "encaminhamento_orientacao" TEXT;
ALTER TABLE "solicitacoes" ADD COLUMN IF NOT EXISTS "encaminhado_em" TIMESTAMP(3);
