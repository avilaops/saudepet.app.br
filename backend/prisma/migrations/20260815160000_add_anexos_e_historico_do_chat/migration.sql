-- Chat entre tutor e veterinário: anexos presos à mensagem, histórico de edição
-- e localização como ponto único.
--
-- A tabela `mensagens` já tinha `tipo`, `metadados`, `editada_em` e `deletada_em`,
-- mas nada preenchia esses campos e não havia onde guardar nem o arquivo enviado
-- nem o conteúdo anterior de uma mensagem editada. Sem isso, "editar" e "apagar"
-- destruiriam o registro da conversa — justamente o que a auditoria de um
-- atendimento precisa preservar.

-- Quem apagou a mensagem. O conteúdo original continua na linha; a exclusão é lógica.
ALTER TABLE "mensagens" ADD COLUMN "deletada_por_id" TEXT;

-- Mensagem que é só uma foto, um documento ou um ponto no mapa não tem texto.
-- Guardar string vazia seria fingir que tem.
ALTER TABLE "mensagens" ALTER COLUMN "conteudo" DROP NOT NULL;

-- Localização compartilhada como ponto único (não rastreamento contínuo).
-- Colunas próprias em vez de JSON solto em `metadados`, porque é dado validado
-- na entrada e lido por quem audita.
ALTER TABLE "mensagens" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "mensagens" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "mensagens" ADD COLUMN "endereco" TEXT;

-- Arquivo trocado no chat, vinculado à mensagem que o enviou.
CREATE TABLE "mensagens_anexos" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "mensagem_id" TEXT NOT NULL,
    -- Chave do objeto no R2, nunca a URL pública: o acesso é por URL assinada.
    "storage_key" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_anexos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensagens_anexos_tenant_id_idx" ON "mensagens_anexos"("tenant_id");
CREATE INDEX "mensagens_anexos_mensagem_id_idx" ON "mensagens_anexos"("mensagem_id");

ALTER TABLE "mensagens_anexos"
    ADD CONSTRAINT "mensagens_anexos_mensagem_id_fkey"
    FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Versão anterior de cada mensagem editada.
CREATE TABLE "mensagens_edicoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "mensagem_id" TEXT NOT NULL,
    "conteudo_anterior" TEXT NOT NULL,
    "editado_por_id" TEXT NOT NULL,
    "editado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mensagens_edicoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mensagens_edicoes_mensagem_id_editado_em_idx" ON "mensagens_edicoes"("mensagem_id", "editado_em");

ALTER TABLE "mensagens_edicoes"
    ADD CONSTRAINT "mensagens_edicoes_mensagem_id_fkey"
    FOREIGN KEY ("mensagem_id") REFERENCES "mensagens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
