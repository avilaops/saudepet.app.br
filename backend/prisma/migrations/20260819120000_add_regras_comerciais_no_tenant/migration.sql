-- Regras comerciais saem do código/env e passam a ser configuráveis pelo painel.
-- A comissão da plataforma estava fixa em 15% no payment.service, e a cidade
-- padrão de cadastro vinha da env CIDADE_INICIAL.
ALTER TABLE "configuracoes_tenant" ADD COLUMN "comissao_plataforma_pct" DECIMAL(5,2) NOT NULL DEFAULT 15.00;
ALTER TABLE "configuracoes_tenant" ADD COLUMN "cidade_padrao" TEXT;
