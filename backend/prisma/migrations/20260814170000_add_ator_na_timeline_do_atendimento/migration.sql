-- Rastreabilidade de quem mudou o status de um atendimento.
-- A tabela já registrava data/hora, mas não o estado de origem nem o ator,
-- então não havia como responder "quem colocou este atendimento em atendimento_em_andamento".
ALTER TABLE "solicitacoes_timeline" ADD COLUMN "status_anterior" "StatusAtendimento";
ALTER TABLE "solicitacoes_timeline" ADD COLUMN "ator_id" TEXT;
ALTER TABLE "solicitacoes_timeline" ADD COLUMN "ator_tipo" TEXT;
ALTER TABLE "solicitacoes_timeline" ADD COLUMN "origem" TEXT NOT NULL DEFAULT 'api';
