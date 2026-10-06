-- Retificação de receita depois do atendimento fechado.
--
-- Até aqui, `PUT /solicitacoes/:id/prescricao` alterava só o texto livre
-- `Solicitacao.receita`. Os `PrescricaoItem` do prontuário continuavam com o
-- conteúdo antigo e o PDF já emitido também — ou seja, o tutor ficava com um
-- documento assinado divergente do registro clínico, e ninguém sabia qual das
-- duas versões valia.
--
-- Agora a correção é um ato registrado: gera uma nova versão do documento,
-- guarda a anterior por inteiro e exige motivo. Nada é sobrescrito em silêncio.

CREATE TABLE "receitas_retificacoes" (
  "id"               TEXT NOT NULL,
  "tenant_id"        TEXT NOT NULL,
  "atendimento_id"   TEXT NOT NULL,
  "prontuario_id"    TEXT,
  "veterinario_id"   TEXT NOT NULL,
  "versao"           INTEGER NOT NULL,
  "motivo"           TEXT NOT NULL,
  "receita_anterior" TEXT,
  "receita_nova"     TEXT,
  "itens_anteriores" JSONB,
  "itens_novos"      JSONB,
  "pdf_anterior_url" TEXT,
  "pdf_novo_url"     TEXT,
  "criado_em"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "receitas_retificacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "receitas_retificacoes_atendimento_idx" ON "receitas_retificacoes"("atendimento_id", "versao");
CREATE INDEX "receitas_retificacoes_tenant_idx" ON "receitas_retificacoes"("tenant_id");

ALTER TABLE "receitas_retificacoes"
  ADD CONSTRAINT "receitas_retificacoes_atendimento_fkey"
  FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Versão vigente da receita do atendimento. 1 = documento original.
ALTER TABLE "solicitacoes" ADD COLUMN "receita_versao" INTEGER NOT NULL DEFAULT 1;
