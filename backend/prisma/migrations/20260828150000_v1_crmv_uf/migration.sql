-- Saúde Pet v1.0 — cadastro de veterinário pede o estado do CRMV.
-- O número do conselho só identifica o profissional junto com a UF emissora.
ALTER TABLE "veterinarios" ADD COLUMN "crmv_uf" VARCHAR(2);
CREATE INDEX "veterinarios_crmv_uf_idx" ON "veterinarios"("crmv_uf");
