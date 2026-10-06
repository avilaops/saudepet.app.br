/**
 * Toda decisão de credenciamento precisa ser ENCONTRÁVEL na central de
 * auditoria — que filtra por `entity_type`/`entity_id`, não por `recurso_id`.
 *
 * Achado do smoke de release da v1.0 (29/08/2026): `veterinario_aprovado` e
 * `veterinario_reativado` apareciam; `veterinario_suspenso` não, porque só
 * gravava `recurso_id`. Rejeição e pedido de reenvio tinham o mesmo buraco.
 */
const express = require('express');
const request = require('supertest');
const prisma = require('../../../src/config/database');
const controller = require('../../../src/controllers/admin-veterinario.controller');
const { errorHandler } = require('../../../src/middleware/error.middleware');
const emailService = require('../../../src/services/email.service');

jest.mock('../../../src/config/r2', () => ({ getSignedDownloadUrl: jest.fn() }));

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: any, _res: any, next: any) => {
    req.userId = 'admin-1';
    req.userType = 'admin';
    req.tenantId = 'tenant-a';
    next();
  });
  a.post('/v/:id/rejeitar', controller.rejeitarCredenciamento);
  a.post('/v/:id/solicitar-reenvio', controller.solicitarReenvio);
  a.post('/v/:id/suspender', controller.suspenderVeterinario);
  a.use(errorHandler);
  return a;
}

const vet = {
  id: 'vet-1', tenant_id: 'tenant-a', usuario_id: 'user-vet', crmv: '123', crmv_uf: 'SP',
  status_credenciamento: 'APPROVED', aprovado_admin: true, online: true,
  documento_url: null, diploma_url: null, documento_analise: null,
  usuario: { nome: 'Ana', email: 'ana@x.com' }
};

function registroDeAuditoria() {
  return prisma.auditLog.create.mock.calls[0][0].data;
}

describe('auditoria das decisões de credenciamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (ops: any[]) => Promise.all(ops));
    prisma.veterinario.findUnique.mockResolvedValue(vet);
    prisma.veterinario.update.mockResolvedValue({ ...vet });
    prisma.usuario.update.mockResolvedValue({});
    prisma.veterinarioSubmissao.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
    // O controller encadeia `.catch` no envio (best-effort): o mock precisa
    // devolver uma Promise, senão o próprio `.catch` vira TypeError → 500.
    emailService.enviarEmailRejeicao.mockResolvedValue(undefined);
    emailService.enviarEmailAprovacao.mockResolvedValue(undefined);
  });

  it.each([
    ['suspender', 'veterinario_suspenso', 'SUSPENDED'],
    ['rejeitar', 'veterinario_rejeitado', 'REJECTED'],
    ['solicitar-reenvio', 'veterinario_solicitou_reenvio', 'REQUIRES_RESUBMISSION']
  ])('%s grava entity_type/entity_id, ator e antes/depois', async (rota, acao, statusFinal) => {
    const res = await request(app()).post(`/v/vet-1/${rota}`).send({ motivo: 'documentos_invalidos', observacao: 'smoke' });
    expect(res.status).toBe(200);

    const registro = registroDeAuditoria();
    expect(registro).toMatchObject({
      acao,
      actor_role: 'admin',
      entity_type: 'Veterinario',
      entity_id: 'vet-1',
      recurso_id: 'vet-1',
      usuario_id: 'admin-1',
      tenant_id: 'tenant-a',
      estado_anterior: expect.objectContaining({ status_credenciamento: 'APPROVED' }),
      estado_posterior: expect.objectContaining({ status_credenciamento: statusFinal, aprovado_admin: false })
    });
    expect(typeof registro.motivo).toBe('string');
    expect(registro.motivo.length).toBeGreaterThan(0);
  });

  it('a busca da central (entity_id contains) acha o registro da suspensão', async () => {
    await request(app()).post('/v/vet-1/suspender').send({});
    const registro = registroDeAuditoria();
    // Mesmo critério de `admin-audit.controller` → where.OR[{ entity_id: { contains: search } }]
    expect(registro.entity_id).toContain('vet-1');
  });
});
