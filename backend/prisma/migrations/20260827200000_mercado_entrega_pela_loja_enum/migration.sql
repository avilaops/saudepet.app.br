-- Saúde Pet Mercado — a loja passa a poder ENTREGAR.
--
-- Só o valor novo do enum, sozinho num arquivo: o Postgres aceita `ADD VALUE`
-- dentro de transação desde a versão 12, mas recusa USAR o valor na mesma
-- transação em que ele nasceu. Separar garante que a migração seguinte (que
-- cria as colunas de frete) nunca esbarre nisso, em qualquer ordem de deploy.
--
-- `loja` = a própria loja leva, com raio e frete calculados pela plataforma.
-- `entregador` continua reservado para a fatia da logística (entregador da
-- plataforma), que ainda não existe.

ALTER TYPE "EntregaMercado" ADD VALUE IF NOT EXISTS 'loja';
