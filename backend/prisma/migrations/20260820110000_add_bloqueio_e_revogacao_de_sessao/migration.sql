-- Duas coisas que o painel prometia e o sistema não fazia.
--
-- 1) `sessoes_revogadas_em`: "revogar sessões", suspender veterinário e trocar
--    a senha só apagavam refresh tokens. O access token dura 7 dias e continuava
--    aceito — quem estava logado seguia dentro. O authMiddleware agora recusa
--    qualquer JWT emitido antes desta marca.
--
-- 2) `bloqueado` / `bloqueado_ate` / `bloqueio_motivo`: a tela de moderação
--    gravava `Punicao` e ninguém lia. Espelhamos o bloqueio no usuário porque o
--    authMiddleware roda a cada request e já carrega esta linha — assim a
--    punição custa zero consulta extra. `bloqueado_ate` NULL com
--    `bloqueado` = true significa permanente.
ALTER TABLE "usuarios"
  ADD COLUMN "sessoes_revogadas_em" TIMESTAMP(3),
  ADD COLUMN "bloqueado" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "bloqueado_ate" TIMESTAMP(3),
  ADD COLUMN "bloqueio_motivo" TEXT;

CREATE INDEX "usuarios_bloqueado_idx" ON "usuarios" ("bloqueado");
