-- Fechamento de comissão dos parceiros.
--
-- `CommissionSettlement` existia no schema, tinha rota de listagem e rota para
-- marcar como pago — e NENHUM ponto do backend criava um. A aba "Liquidações &
-- Repasses" do painel era estruturalmente vazia: a rede de parceiros gerava
-- conversões e comissões e o ciclo do dinheiro nunca fechava.
--
-- Para gerar fechamento sem contar a mesma conversão duas vezes, cada conversão
-- precisa saber em que fechamento entrou.
ALTER TABLE "referral_conversions" ADD COLUMN "settlementId" TEXT;

CREATE INDEX "referral_conversions_settlementId_idx" ON "referral_conversions" ("settlementId");

ALTER TABLE "referral_conversions"
  ADD CONSTRAINT "referral_conversions_settlementId_fkey"
  FOREIGN KEY ("settlementId") REFERENCES "commission_settlements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Fechamento pertence a um tenant. O modelo só guardava `partnerId`, então a
-- listagem do painel mostrava fechamento de qualquer organização.
ALTER TABLE "commission_settlements" ADD COLUMN "tenantId" TEXT;

CREATE INDEX "commission_settlements_tenantId_idx" ON "commission_settlements" ("tenantId");
