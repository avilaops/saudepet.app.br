-- Catálogo comercial próprio do veterinário. A tabela municipal permanece
-- como fallback para quem ainda não publicou preços individuais.
CREATE TYPE "CategoriaCatalogoVeterinario" AS ENUM (
  'SERVICO_DOMICILIAR',
  'VACINA',
  'OUTRO_SERVICO',
  'ADICIONAL_HORARIO'
);

CREATE TABLE "catalogo_itens_veterinario" (
  "id" UUID NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "veterinario_id" TEXT NOT NULL,
  "codigo" VARCHAR(80) NOT NULL,
  "nome" VARCHAR(120) NOT NULL,
  "categoria" "CategoriaCatalogoVeterinario" NOT NULL,
  "tipo_atendimento" "TipoAtendimento",
  "preco" DECIMAL(10,2),
  "ativo" BOOLEAN NOT NULL DEFAULT false,
  "ordem" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "catalogo_itens_veterinario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "catalogo_itens_veterinario_veterinario_id_codigo_key"
  ON "catalogo_itens_veterinario"("veterinario_id", "codigo");
CREATE INDEX "catalogo_itens_veterinario_tenant_id_categoria_ativo_idx"
  ON "catalogo_itens_veterinario"("tenant_id", "categoria", "ativo");
CREATE INDEX "catalogo_itens_veterinario_tenant_id_tipo_atendimento_ativo_idx"
  ON "catalogo_itens_veterinario"("tenant_id", "tipo_atendimento", "ativo");

ALTER TABLE "catalogo_itens_veterinario"
  ADD CONSTRAINT "catalogo_itens_veterinario_veterinario_id_fkey"
  FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agendamentos"
  ADD COLUMN "valor_estimado" DECIMAL(10,2),
  ADD COLUMN "preco_catalogo_codigo" VARCHAR(80);
