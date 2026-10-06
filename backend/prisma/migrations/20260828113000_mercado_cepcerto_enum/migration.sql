-- O valor do enum fica sozinho: o PostgreSQL não permite usar um valor novo
-- na mesma transação em que ele é adicionado.
ALTER TYPE "EntregaMercado" ADD VALUE IF NOT EXISTS 'transportadora';
