import { PrismaClient } from '@prisma/client';

/**
 * A única instância do Prisma Client da aplicação.
 *
 * Em desenvolvimento ela vive no objeto global de propósito: o recarregamento a
 * quente reimporta o módulo a cada alteração, e sem isso cada salvamento abriria
 * mais um punhado de conexões até o Postgres recusar.
 *
 * Primeiro arquivo do backend em TypeScript, e não por acaso: é o mais
 * importado da casa, então tipá-lo entrega o modelo inteiro do banco — com
 * autocompletar e verificação de campo — a todo arquivo que nascer `.ts` daqui
 * em diante.
 */

const globalParaPrisma = globalThis as typeof globalThis & { prisma?: PrismaClient };

const prisma: PrismaClient =
  process.env.NODE_ENV === 'production'
    ? new PrismaClient()
    : (globalParaPrisma.prisma ??= new PrismaClient({ log: ['error', 'warn'] }));

// Encerramento limpo: devolve as conexões antes de o processo sair.
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export = prisma;
