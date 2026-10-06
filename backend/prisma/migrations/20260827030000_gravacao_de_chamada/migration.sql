-- Gravação de teleorientação para auditoria interna.
--
-- Toda chamada é gravada. Não é conteúdo do produto: nem o tutor nem o
-- veterinário têm acesso — a moderação abre quando houver denúncia, e todo
-- acesso vai para o AuditLog.
--
-- Duas gravações por chamada, uma de cada lado, porque navegador que fecha no
-- meio não pode levar a apuração junto.

CREATE TABLE "gravacoes_chamada" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "autor_usuario_id" TEXT NOT NULL,
    "autor_papel" TEXT NOT NULL,
    "duracao_seg" INTEGER,
    "tamanho_bytes" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL DEFAULT 'audio/webm',
    "status" TEXT NOT NULL DEFAULT 'gravando',
    "iniciada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizada_em" TIMESTAMP(3),
    -- LGPD: dado sensível tem prazo. A varredura apaga o áudio depois desta
    -- data e mantém a linha, para o histórico mostrar que existiu e venceu.
    "expira_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gravacoes_chamada_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gravacoes_chamada_partes" (
    "id" TEXT NOT NULL,
    "gravacao_id" TEXT NOT NULL,
    -- Ordem de chegada. A parte 0 carrega o cabeçalho do contêiner; fora de
    -- ordem, o áudio não toca.
    "indice" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gravacoes_chamada_partes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gravacoes_chamada_tenant_id_idx" ON "gravacoes_chamada"("tenant_id");
CREATE INDEX "gravacoes_chamada_atendimento_id_idx" ON "gravacoes_chamada"("atendimento_id");
-- A varredura de retenção percorre por vencimento; sem índice ela varre tudo.
CREATE INDEX "gravacoes_chamada_expira_em_idx" ON "gravacoes_chamada"("expira_em");

CREATE INDEX "gravacoes_chamada_partes_gravacao_id_idx" ON "gravacoes_chamada_partes"("gravacao_id");
-- Duas partes com o mesmo índice embaralhariam o áudio; o banco recusa.
CREATE UNIQUE INDEX "gravacoes_chamada_partes_gravacao_id_indice_key" ON "gravacoes_chamada_partes"("gravacao_id", "indice");

ALTER TABLE "gravacoes_chamada" ADD CONSTRAINT "gravacoes_chamada_atendimento_id_fkey"
    FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "gravacoes_chamada_partes" ADD CONSTRAINT "gravacoes_chamada_partes_gravacao_id_fkey"
    FOREIGN KEY ("gravacao_id") REFERENCES "gravacoes_chamada"("id") ON DELETE CASCADE ON UPDATE CASCADE;
