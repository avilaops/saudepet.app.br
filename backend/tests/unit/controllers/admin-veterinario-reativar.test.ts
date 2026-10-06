/**
 * Admin reativa veterinário suspenso/recusado — e só esses.
 */
const express = require('express');
const request = require('supertest');
const prisma = require('../../../src/config/database');
const controller = require('../../../src/controllers/admin-veterinario.controller');
const { errorHandler } = require('../../../src/middleware/error.middleware');

jest.mock('../../../src/config/r2', () => ({ getSignedDownloadUrl: jest.fn() }));

function appComoAdmin() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.userId = 'admin-1';
    req.userType = 'admin';
    req.tenantId = 'tenant-a';
    next();
  });
  app.post('/admin/veterinarios/:id/reativar', controller.reativarVeterinario);
  app.use(errorHandler);
  return app;
}

describe('POST /admin/veterinarios/:id/reativar', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
    prisma.veterinario.update.mockResolvedValue({ id: 'vet-1', status_credenciamento: 'APPROVED', aprovado_admin: true });
    prisma.usuario.update.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('reativa suspenso: APPROVED, papel veterinario e auditoria', async () => {
    prisma.veterinario.findFirst.mockResolvedValue({
      id: 'vet-1', tenant_id: 'tenant-a', usuario_id: 'user-vet', crmv: '123', crmv_uf: 'SP',
      status_credenciamento: 'SUSPENDED', aprovado_admin: false, usuario: { nome: 'Ana', email: 'ana@x.com' }
    });
    const res = await request(appComoAdmin()).post('/admin/veterinarios/vet-1/reativar').send({ motivo: 'Pendência resolvida' });
    expect(res.status).toBe(200);
    expect(prisma.veterinario.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status_credenciamento: 'APPROVED', aprovado_admin: true, decidido_por_id: 'admin-1' })
    }));
    expect(prisma.usuario.update).toHaveBeenCalledWith({ where: { id: 'user-vet' }, data: { tipo_usuario: 'veterinario' } });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ acao: 'veterinario_reativado', usuario_id: 'admin-1', motivo: 'Pendência resolvida' })
    });
  });

  it('não reativa quem já está aprovado ou pendente', async () => {
    prisma.veterinario.findFirst.mockResolvedValue({
      id: 'vet-1', tenant_id: 'tenant-a', status_credenciamento: 'PENDING_REVIEW', usuario: {}
    });
    const res = await request(appComoAdmin()).post('/admin/veterinarios/vet-1/reativar');
    expect(res.status).toBe(400);
    expect(prisma.veterinario.update).not.toHaveBeenCalled();
  });

  it('veterinário de outro tenant não é encontrado', async () => {
    prisma.veterinario.findFirst.mockResolvedValue(null);
    const res = await request(appComoAdmin()).post('/admin/veterinarios/vet-x/reativar');
    expect(res.status).toBe(404);
    expect(prisma.veterinario.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'vet-x', tenant_id: 'tenant-a' } }));
  });
});
