-- Acerta `veterinarios.total_atendimentos` com o que já foi atendido.
--
-- O contador parou de ser alimentado quando a soma saiu da avaliação: o
-- fechamento do atendimento, que deveria contar, nunca contou. Daqui em diante
-- o fechamento reconta (solicitacao.controller); esta migração traz o passado.
-- Só dado, sem mudança de estrutura, e idempotente.

UPDATE "veterinarios" v
SET "total_atendimentos" = c.total
FROM (
  SELECT "veterinario_id", COUNT(*)::int AS total
  FROM "solicitacoes"
  WHERE "veterinario_id" IS NOT NULL AND "status" IN ('finalizado', 'concluido')
  GROUP BY "veterinario_id"
) c
WHERE v."id" = c."veterinario_id" AND v."total_atendimentos" IS DISTINCT FROM c.total;
