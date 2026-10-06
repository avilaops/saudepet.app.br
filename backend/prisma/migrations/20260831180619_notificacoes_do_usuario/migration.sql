-- Histórico do que foi avisado a cada pessoa.
--
-- Aditiva por padrão (regra 6 do ROADMAP): cria tabela nova e não toca em
-- nenhuma existente. O `prisma migrate dev` queria incluir aqui uma dezena de
-- alterações sem relação com isto (DROP INDEX em commission_settlements e
-- mercado_pedidos, mudança de tipo em colunas do Mercado): é drift antigo
-- entre `schema.prisma` e o histórico de migrations, não faz parte desta
-- mudança e não pode viajar de carona para produção.

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "categoria" TEXT NOT NULL DEFAULT 'atualizacoes',
    "titulo" TEXT NOT NULL,
    "mensagem" TEXT NOT NULL,
    "link" TEXT,
    "icone" TEXT NOT NULL DEFAULT 'bell',
    "urgente" BOOLEAN NOT NULL DEFAULT false,
    "lida" BOOLEAN NOT NULL DEFAULT false,
    "lida_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notificacoes_tenant_id_usuario_id_criado_em_idx" ON "notificacoes"("tenant_id", "usuario_id", "criado_em" DESC);

-- CreateIndex
CREATE INDEX "notificacoes_usuario_id_lida_idx" ON "notificacoes"("usuario_id", "lida");

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
