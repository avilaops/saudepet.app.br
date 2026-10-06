-- Emergência clínica: a spec do orquestrador exige registrar quando o tutor é
-- orientado a buscar um serviço de emergência. Sem este status, o desfecho
-- sumia — o atendimento ou finalizava "normal" ou era cancelado, e nenhum dos
-- dois era verdade.
ALTER TYPE "StatusAtendimento" ADD VALUE IF NOT EXISTS 'encaminhado';
