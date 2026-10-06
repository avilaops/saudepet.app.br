-- O pedido de avaliação que nunca era feito.
--
-- O template existia pronto e nada o chamava: o tutor só avaliava se voltasse
-- ao aplicativo por conta própria — e quem teve um bom atendimento raramente
-- volta só para elogiar, o que constrói uma média feita quase só por quem teve
-- motivo de reclamar.
--
-- A coluna guarda quando pedimos. Sem ela, o worker mandaria o mesmo e-mail de
-- hora em hora até a pessoa avaliar.
ALTER TABLE "solicitacoes" ADD COLUMN IF NOT EXISTS "avaliacao_pedida_em" TIMESTAMP(3);
