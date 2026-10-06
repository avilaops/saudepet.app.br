-- A central de notificações perdeu as abas.
--
-- A primeira versão dividia os avisos em quatro categorias e a tela abria
-- numa aba fixa: o veterinário via "2" no sino, entrava e encontrava a tela
-- vazia, porque os avisos estavam nas outras abas. Uma lista só resolve, e
-- então ninguém mais lê esta coluna.
--
-- Remoção segura pela regra 6 do ROADMAP: a coluna nasceu hoje, na migration
-- anterior, e o commit que apaga a leitura é o mesmo que apaga a coluna.
ALTER TABLE "notificacoes" DROP COLUMN "categoria";
