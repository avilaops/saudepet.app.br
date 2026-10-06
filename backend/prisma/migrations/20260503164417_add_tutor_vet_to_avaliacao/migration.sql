/*
  Warnings:

  - Added the required column `tutor_id` to the `avaliacoes` table without a default value. This is not possible if the table is not empty.
  - Added the required column `veterinario_id` to the `avaliacoes` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "avaliacoes" ADD COLUMN     "tutor_id" TEXT NOT NULL,
ADD COLUMN     "veterinario_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "avaliacoes_veterinario_id_idx" ON "avaliacoes"("veterinario_id");

-- CreateIndex
CREATE INDEX "avaliacoes_tutor_id_idx" ON "avaliacoes"("tutor_id");

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_tutor_id_fkey" FOREIGN KEY ("tutor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avaliacoes" ADD CONSTRAINT "avaliacoes_veterinario_id_fkey" FOREIGN KEY ("veterinario_id") REFERENCES "veterinarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
