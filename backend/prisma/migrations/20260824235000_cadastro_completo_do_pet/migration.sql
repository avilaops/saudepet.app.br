-- Cadastro do pet e do tutor como o briefing pede.
--
-- Cor, pedigree e condições preexistentes não existiam; o resto (sexo, porte,
-- castração, data de nascimento, microchip) existia no banco e nunca era
-- gravado — o controller lia cinco campos e descartava o resto em silêncio.
--
-- Aditiva: colunas opcionais.
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "cor" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "pedigree" TEXT;
ALTER TABLE "pets" ADD COLUMN IF NOT EXISTS "condicoes_preexistentes" TEXT;

-- Data de nascimento do tutor, pedida pelo briefing no perfil.
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "data_nascimento" TIMESTAMP(3);
