-- Assinatura paga precisa de cobrança de verdade.
--
-- `assinarPlano` criava a assinatura já como 'ativa' e uma `Transacao` pendente
-- que nenhum ponto do sistema processava: o plano pago do tutor e o CRM pago do
-- veterinário eram liberados de graça, para sempre.
--
-- Agora a assinatura nasce 'pendente' e uma cobrança real é aberta no gateway.
-- O webhook precisa saber qual assinatura ativar quando o pagamento é
-- confirmado — é para isso que serve esta coluna.
ALTER TABLE "payments" ADD COLUMN "assinatura_id" TEXT;

CREATE INDEX "payments_assinatura_id_idx" ON "payments" ("assinatura_id");
