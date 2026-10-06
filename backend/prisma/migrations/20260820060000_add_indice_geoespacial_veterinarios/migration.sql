-- Busca por proximidade dentro do banco, com índice espacial de verdade.
--
-- O despacho por distância nasceu calculando Haversine em JavaScript sobre
-- TODOS os veterinários de plantão carregados na memória do Node. Funciona
-- com dez profissionais e degrada linearmente: com mil, é uma varredura
-- completa a cada chamado.
--
-- `cube` + `earthdistance` são as extensões nativas do PostgreSQL para isso.
-- PostGIS seria a escolha se precisássemos de polígonos, projeções ou
-- roteamento — aqui a pergunta é "quem está a até N km deste ponto", que o
-- earthdistance responde com índice GiST e sem instalar GEOS/PROJ/GDAL.

-- ATENÇÃO ao subir num ambiente novo: `CREATE EXTENSION` exige superusuário.
-- O app roda com usuário restrito (como deve), então esta migração falha com
-- "permission denied to create extension" até alguém rodar, uma única vez,
-- como superusuário do banco:
--
--   sudo -u postgres psql -d saudepet \
--     -c 'CREATE EXTENSION IF NOT EXISTS cube;' \
--     -c 'CREATE EXTENSION IF NOT EXISTS earthdistance;'
--
-- Com as extensões já presentes, o `IF NOT EXISTS` abaixo vira no-op e a
-- migração passa com o usuário do app. Se ela já tiver falhado, destrave com
-- `prisma migrate resolve --rolled-back <nome>` antes de reaplicar.
CREATE EXTENSION IF NOT EXISTS cube;
CREATE EXTENSION IF NOT EXISTS earthdistance;

-- `ll_to_earth` converte (lat, lon) num ponto 3D; o GiST sobre essa expressão
-- é o que permite ao planner podar por caixa envolvente (`earth_box`) em vez
-- de calcular distância linha a linha.
CREATE INDEX IF NOT EXISTS idx_veterinarios_geo
  ON veterinarios USING gist (ll_to_earth(latitude, longitude))
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- O filtro de plantão vem sempre junto do geográfico.
CREATE INDEX IF NOT EXISTS idx_veterinarios_plantao
  ON veterinarios (tenant_id, online, aprovado_admin)
  WHERE online = true;
