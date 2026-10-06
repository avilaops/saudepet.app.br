-- Roda uma única vez, na criação do volume do banco local.
-- O `POSTGRES_DB` do compose já cria o `saudepet` (desenvolvimento); aqui nasce o
-- par de teste, para que a suíte nunca escreva no banco em que se trabalha.
CREATE DATABASE saudepet_test;
