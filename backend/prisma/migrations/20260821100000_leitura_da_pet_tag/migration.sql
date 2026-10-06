-- Leitura da coleira (pet-tag).
--
-- A página pública do QR mostrava os dados do pet e oferecia um botão "Achei
-- este Pet! Alertar Tutor" que era apenas um deeplink de WhatsApp: o sistema
-- NUNCA ficava sabendo que a coleira tinha sido lida. Quem achasse o animal e
-- não quisesse (ou não pudesse) mandar mensagem simplesmente sumia do mapa, e o
-- tutor não tinha nenhum sinal de que o pet havia sido visto.
--
-- Cada leitura vira um registro: quando, de onde (se a pessoa autorizar a
-- localização) e o recado que ela deixou.
CREATE TABLE "pet_tag_scans" (
  "id"          TEXT NOT NULL,
  "tenant_id"   TEXT,
  "pet_id"      TEXT NOT NULL,
  "latitude"    DOUBLE PRECISION,
  "longitude"   DOUBLE PRECISION,
  "mensagem"    TEXT,
  "contato"     TEXT,
  "ip"          TEXT,
  "user_agent"  TEXT,
  -- Distingue a abertura da página (passiva) do toque em "Achei este pet"
  -- (deliberado): o tutor precisa saber a diferença entre alguém que abriu o
  -- link e alguém que está com o animal.
  "deliberado"  BOOLEAN NOT NULL DEFAULT false,
  "criado_em"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "pet_tag_scans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pet_tag_scans_pet_id_criado_em_idx" ON "pet_tag_scans" ("pet_id", "criado_em");
CREATE INDEX "pet_tag_scans_tenant_id_idx" ON "pet_tag_scans" ("tenant_id");

ALTER TABLE "pet_tag_scans"
  ADD CONSTRAINT "pet_tag_scans_pet_id_fkey"
  FOREIGN KEY ("pet_id") REFERENCES "pets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
