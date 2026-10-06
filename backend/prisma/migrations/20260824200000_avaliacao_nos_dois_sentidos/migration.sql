-- Avaliação nos dois sentidos.
--
-- O modelo só sabia uma direção: um atendimento comportava uma avaliação, e ela
-- era sempre do tutor sobre o veterinário. `autor_papel` diz quem escreveu, e a
-- unicidade passa a ser por lado — uma de cada, por atendimento.
--
-- Aditiva: a coluna nasce com `tutor` como padrão, que é exatamente o que toda
-- avaliação existente é.
ALTER TABLE "avaliacoes" ADD COLUMN IF NOT EXISTS "autor_papel" TEXT NOT NULL DEFAULT 'tutor';

DROP INDEX IF EXISTS "avaliacoes_atendimento_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "avaliacoes_atendimento_id_autor_papel_key"
    ON "avaliacoes"("atendimento_id", "autor_papel");

-- Reputação do tutor. Fica gravada, e não calculada na leitura, porque o
-- veterinário precisa dela na FILA de chamados: calcular por chamado seria uma
-- consulta a mais em cada card, no momento em que a tela precisa ser rápida.
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "avaliacao_media" DOUBLE PRECISION;
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "total_avaliacoes" INTEGER NOT NULL DEFAULT 0;
