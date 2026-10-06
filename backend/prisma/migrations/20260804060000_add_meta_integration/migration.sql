ALTER TABLE "leads" ADD COLUMN "external_id" TEXT;
CREATE UNIQUE INDEX "leads_tenant_id_external_id_key" ON "leads"("tenant_id", "external_id");

ALTER TABLE "usuarios" ADD COLUMN "facebook_id" TEXT;
CREATE UNIQUE INDEX "usuarios_tenant_id_facebook_id_key" ON "usuarios"("tenant_id", "facebook_id");

CREATE TABLE "whatsapp_messages" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "wa_message_id" TEXT,
  "wa_phone" TEXT NOT NULL,
  "usuario_id" TEXT,
  "solicitacao_id" TEXT,
  "template_name" TEXT,
  "body" TEXT,
  "status" TEXT NOT NULL DEFAULT 'enviada',
  "error_detail" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_messages_wa_message_id_key" ON "whatsapp_messages"("wa_message_id");
CREATE INDEX "whatsapp_messages_tenant_id_wa_phone_idx" ON "whatsapp_messages"("tenant_id", "wa_phone");
CREATE INDEX "whatsapp_messages_tenant_id_created_at_idx" ON "whatsapp_messages"("tenant_id", "created_at");
CREATE INDEX "whatsapp_messages_tenant_id_usuario_id_idx" ON "whatsapp_messages"("tenant_id", "usuario_id");
