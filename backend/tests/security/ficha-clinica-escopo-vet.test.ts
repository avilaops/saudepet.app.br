/**
 * Veterinário só mexe na ficha de pets que atendeu; admin vê tudo.
 */
const express = require('express');
const request = require('supertest');
const prisma = require('../../src/config/database');
const controller = require('../../src/controllers/ficha-clinica.controller');
const { errorHandler } = require('../../src/middleware/error.middleware');
const { veterinarioAtendeuOPet } = require('../../src/services/politica-acesso.service');

jest.mock('../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

function appComo(userType: string, veterinarioId: string | null = 'vet-1') {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.userId = 'user-1';
    req.userType = userType;
    req.tenantId = 'tenant-a';
    req.user = { veterinario: veterinarioId ? { id: veterinarioId } : null };
    next();
  });
  app.get('/pets/:petId/removidos', controller.listarRemovidos);
  app.delete('/pets/:petId/alergias/:id', controller.removerAlergia);
  app.use(errorHandler);
  return app;
}

describe('escopo do veterinário na ficha clínica', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.petAlergia.findMany.mockResolvedValue([]);
    prisma.petVacina.findMany.mockResolvedValue([]);
    prisma.petMedicamento.findMany.mockResolvedValue([]);
  });

  it('veterinário sem chamado nem consulta com o pet recebe 403', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.agendamento.findFirst.mockResolvedValue(null);
    const res = await request(appComo('veterinario')).get('/pets/pet-alheio/removidos');
    expect(res.status).toBe(403);
    expect(prisma.petAlergia.findMany).not.toHaveBeenCalled();
  });

  it('veterinário que atendeu o pet passa', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-1' });
    prisma.agendamento.findFirst.mockResolvedValue(null);
    const res = await request(appComo('veterinario')).get('/pets/pet-1/removidos');
    expect(res.status).toBe(200);
    expect(prisma.solicitacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 'tenant-a', pet_id: 'pet-1', veterinario_id: 'vet-1' }
    }));
  });

  it('consulta agendada também conta como atendimento', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.agendamento.findFirst.mockResolvedValue({ id: 'ag-1' });
    expect(await veterinarioAtendeuOPet(prisma, { veterinarioId: 'vet-1', petId: 'pet-1', tenantId: 'tenant-a' })).toBe(true);
  });

  it('admin não precisa ter atendido', async () => {
    const res = await request(appComo('admin', null)).get('/pets/pet-1/removidos');
    expect(res.status).toBe(200);
    expect(prisma.solicitacao.findFirst).not.toHaveBeenCalled();
  });

  it('remoção também respeita o escopo', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.agendamento.findFirst.mockResolvedValue(null);
    const res = await request(appComo('veterinario')).delete('/pets/pet-alheio/alergias/al-1').send({ motivo: 'erro de digitação' });
    expect(res.status).toBe(403);
    expect(prisma.petAlergia.update).not.toHaveBeenCalled();
  });
});
