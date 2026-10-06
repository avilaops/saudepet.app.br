-- Remove `solicitacoes_anexos`, que nunca recebeu uma linha.
--
-- A tabela nasceu para ser o "acervo de arquivos do atendimento", mas nenhum
-- código jamais escreveu nela: os arquivos sempre viveram presos à mensagem
-- do chat (`mensagens_anexos`), que é onde estão a URL assinada, a política
-- de retenção e a auditoria. Manter uma segunda tabela para os mesmos bytes
-- só convidava alguém a gravar no lugar errado.
--
-- O acervo passou a ser uma LEITURA sobre o que já existe:
-- `GET /solicitacoes/:id/anexos` devolve os anexos das mensagens do
-- atendimento. Nenhum dado é perdido aqui — conferido antes de remover:
-- 0 linhas em desenvolvimento e 0 em produção.

DROP TABLE IF EXISTS "solicitacoes_anexos";
