-- Desconto do plano de assinatura.
--
-- `limite_atendimentos` estava gravado e nunca era aplicado, e sozinho era
-- ambíguo: teto de atendimentos (bloquear alguém de chamar veterinário para um
-- pet doente) ou franquia de atendimentos grátis? A economia dos planos
-- cadastrados resolve a dúvida:
--
--   Saúde PET Básico — R$ 29,90/mês, "10% de desconto em todas as consultas",
--   limite_atendimentos = 2. Consulta domiciliar custa R$ 150; 10% são R$ 15;
--   dois por mês são R$ 30, praticamente a mensalidade.
--
-- Ou seja: o número é quantos atendimentos por mês recebem o DESCONTO do plano.
-- Não é teto de atendimento (o tutor sempre pode chamar) nem franquia de
-- atendimento grátis (o texto dos planos vende desconto, nunca consulta inclusa).
--
-- O percentual vivia só no texto de benefícios ("10% de desconto..."), que é
-- vitrine e não regra. Agora é campo.
ALTER TABLE "planos_assinatura" ADD COLUMN "desconto_pct" DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Preenchido a partir do que cada plano já promete na própria vitrine.
UPDATE "planos_assinatura" SET "desconto_pct" = 10 WHERE "nome" ILIKE '%Básico%' AND "tipo_usuario" = 'tutor';
UPDATE "planos_assinatura" SET "desconto_pct" = 20 WHERE "nome" ILIKE '%VIP%' AND "tipo_usuario" = 'tutor';

-- O desconto sai da comissão da plataforma, nunca do repasse do veterinário —
-- quem vende o plano é a plataforma, e é ela que banca o benefício. Guardar o
-- preço cheio na cobrança é o que permite calcular o repasse sobre ele.
ALTER TABLE "payments" ADD COLUMN "preco_cheio" DECIMAL(10,2);
ALTER TABLE "payments" ADD COLUMN "desconto_valor" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN "desconto_assinatura_id" TEXT;

CREATE INDEX "payments_desconto_assinatura_id_idx" ON "payments" ("desconto_assinatura_id");
