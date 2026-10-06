-- AlterTable
ALTER TABLE "veterinarios" ADD COLUMN     "documento_analisado_em" TIMESTAMP(3),
ADD COLUMN     "documento_analise" JSONB,
ADD COLUMN     "documento_url" TEXT;
