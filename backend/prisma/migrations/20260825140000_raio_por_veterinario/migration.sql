-- Raio e área de atuação por profissional.
--
-- O raio era só da cidade, igual para todos: o veterinário que só atende a zona
-- sul recebia chamado do outro lado, recusava, e o tutor esperava mais por um
-- "não" previsível.
--
-- Aditiva e opcional: vazio continua usando o raio da cidade, que é o
-- comportamento de hoje.
ALTER TABLE "veterinarios" ADD COLUMN IF NOT EXISTS "raio_atendimento_km" INTEGER;
ALTER TABLE "veterinarios" ADD COLUMN IF NOT EXISTS "area_atuacao" TEXT;
