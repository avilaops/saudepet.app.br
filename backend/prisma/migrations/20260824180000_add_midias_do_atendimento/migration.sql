-- Mídia do atendimento: o que a descrição escrita não mostra.
--
-- Duas origens, um lugar só: o tutor anexa ao pedir socorro (e é isso que o
-- veterinário olha antes de aceitar), o veterinário anexa durante a consulta.
--
-- Aditiva: tabela nova, nada existente é tocado. Guarda a chave do R2, nunca a
-- URL pública — o acesso é por URL assinada gerada na leitura.
CREATE TABLE "midias_atendimento" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "atendimento_id" TEXT NOT NULL,
    "autor_usuario_id" TEXT NOT NULL,
    "autor_papel" TEXT NOT NULL,
    "veterinario_id" TEXT,
    "storage_key" TEXT NOT NULL,
    "nome_original" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamanho_bytes" INTEGER NOT NULL,
    "tipo" TEXT NOT NULL,
    "legenda" TEXT,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "midias_atendimento_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "midias_atendimento_tenant_id_idx" ON "midias_atendimento"("tenant_id");
CREATE INDEX "midias_atendimento_atendimento_id_idx" ON "midias_atendimento"("atendimento_id");

ALTER TABLE "midias_atendimento" ADD CONSTRAINT "midias_atendimento_atendimento_id_fkey"
    FOREIGN KEY ("atendimento_id") REFERENCES "solicitacoes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "midias_atendimento" ADD CONSTRAINT "midias_atendimento_veterinario_id_fkey"
    FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A tabela de fotos clínicas nasceu hoje, ficou de pé por menos de um dia e
-- nunca recebeu uma linha em produção: some, porque `midias_atendimento` faz o
-- que ela fazia e mais.
DROP TABLE IF EXISTS "fotos_clinicas";
