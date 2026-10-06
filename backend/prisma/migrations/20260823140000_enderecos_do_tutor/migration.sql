-- Endereços salvos do tutor.
--
-- Mesmo com o mapa no passo 3, escolher o local do zero a cada chamado é atrito
-- no pior momento possível — o pet passando mal e a pessoa procurando a casa
-- dela no mapa. Endereço salvo é o que permite "Casa" em um toque, com a
-- coordenada já confirmada uma vez.
CREATE TABLE "enderecos_tutor" (
  "id"          TEXT NOT NULL,
  "tenant_id"   TEXT NOT NULL,
  "tutor_id"    TEXT NOT NULL,
  "rotulo"      TEXT NOT NULL,
  "endereco"    TEXT NOT NULL,
  "complemento" TEXT,
  "cidade"      TEXT,
  "latitude"    DOUBLE PRECISION NOT NULL,
  "longitude"   DOUBLE PRECISION NOT NULL,
  "principal"   BOOLEAN NOT NULL DEFAULT false,
  "usado_em"    TIMESTAMP(3),
  "criado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "enderecos_tutor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "enderecos_tutor_tutor_id_idx" ON "enderecos_tutor" ("tutor_id");
CREATE INDEX "enderecos_tutor_tenant_id_idx" ON "enderecos_tutor" ("tenant_id");

ALTER TABLE "enderecos_tutor"
  ADD CONSTRAINT "enderecos_tutor_tutor_id_fkey"
  FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
