-- CreateTable
CREATE TABLE "configuracoes_notificacao" (
    "id" TEXT NOT NULL,
    "notificacao_email" BOOLEAN NOT NULL DEFAULT true,
    "notificacao_popup" BOOLEAN NOT NULL DEFAULT true,
    "notificacao_sms" BOOLEAN NOT NULL DEFAULT false,
    "email_novo_veterinario" BOOLEAN NOT NULL DEFAULT true,
    "popup_novo_veterinario" BOOLEAN NOT NULL DEFAULT true,
    "sms_novo_veterinario" BOOLEAN NOT NULL DEFAULT false,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracoes_notificacao_pkey" PRIMARY KEY ("id")
);
