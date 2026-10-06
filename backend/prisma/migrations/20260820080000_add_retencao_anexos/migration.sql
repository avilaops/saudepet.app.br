-- Política de retenção do binário dos anexos do chat.
--
-- Dois vazamentos do bucket R2 conviviam desde que o chat ganhou anexos:
-- o arquivo sobe antes da linha existir (se a gravação falha e a remoção
-- compensatória também, o objeto fica pago no bucket sem ninguém atrás dele), e
-- a exclusão lógica da mensagem nunca removia o arquivo — o objeto ficava para
-- sempre, mesmo com a mensagem apagada.
--
-- A auditoria do conteúdo é intencional: o admin do tenant enxerga a mensagem
-- excluída. Por isso a retenção NÃO apaga linha nenhuma; apaga só o binário no
-- R2 e carimba aqui quando isso aconteceu. A coluna serve a dois propósitos:
-- impedir que o worker tente remover o mesmo objeto todo dia, e permitir à API
-- dizer à tela "arquivo removido por política de retenção" em vez de servir uma
-- URL assinada que aponta para o nada.
ALTER TABLE "mensagens_anexos" ADD COLUMN "arquivo_removido_em" TIMESTAMP(3);

-- O worker procura sempre pelos anexos que ainda têm binário. Sem o índice
-- parcial, a varredura diária lê a tabela inteira só para descartar o que já
-- removeu.
CREATE INDEX "idx_mensagens_anexos_binario_vivo"
  ON "mensagens_anexos"("arquivo_removido_em")
  WHERE "arquivo_removido_em" IS NULL;
