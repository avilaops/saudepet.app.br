-- Logo do veterinário na receita e no prontuário.
--
-- Escrita à mão: `prisma migrate dev` arrasta a deriva do schema junto.
-- Aditiva e opcional: quem não enviar logo continua com os documentos de hoje.

ALTER TABLE "veterinarios" ADD COLUMN "logo_documentos_url" TEXT;
