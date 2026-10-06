const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const prisma = require('../../src/config/database');
const solicitacaoRoutes = require('../../src/routes/solicitacao.routes');
const mensagemRoutes = require('../../src/routes/mensagem.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';
const TUTOR_A = 'tutor-a';

function tokenFor(userId, role = 'tutor', tenantId = TENANT_A) {
  return jwt.sign({ id: userId, tipo_usuario: role, tenant_id: tenantId }, process.env.JWT_SECRET);
}

describe('isolamento multi-tenant clínico', () => {
  let app;

  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    app = express();
    app.use(express.json());
    app.set('io', { to: jest.fn(() => ({ emit: jest.fn() })) });
    app.use('/solicitacoes', solicitacaoRoutes);
    app.use('/mensagens', mensagemRoutes);
    app.use(errorHandler);

    prisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    prisma.usuario.findUnique.mockResolvedValue({
      id: TUTOR_A,
      tenant_id: TENANT_A,
      tipo_usuario: 'tutor',
      email_verificado: true,
      tenant: { status: 'ativo', expira_em: null },
      veterinario: null
    });
    prisma.tenant.findUnique.mockResolvedValue({ status: 'ativo', expira_em: null, plano: 'premium' });
  });

  it('retorna 404 e não expõe solicitação de outro tenant', async () => {
    prisma.solicitacao.findFirst.mockImplementation(async ({ where }) => {
      if (where.id === 'request-b' && where.tenant_id === TENANT_B) {
        return { id: 'request-b', tenant_id: TENANT_B, tutor_id: 'tutor-b' };
      }
      return null;
    });

    const response = await request(app)
      .get('/solicitacoes/request-b')
      .set('Authorization', `Bearer ${tokenFor(TUTOR_A)}`);

    expect(response.status).toBe(404);
    expect(prisma.solicitacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'request-b', tenant_id: TENANT_A })
    }));
  });

  it('impede mensagem para atendimento de outro tenant e não persiste conteúdo', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .post('/mensagens')
      .set('Authorization', `Bearer ${tokenFor(TUTOR_A)}`)
      .send({ solicitacao_id: '11111111-1111-4111-8111-111111111111', conteudo: 'mensagem bloqueada' });

    expect(response.status).toBe(404);
    expect(prisma.mensagem.create).not.toHaveBeenCalled();
    expect(prisma.solicitacao.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ tenant_id: TENANT_A })
    }));
  });

  it('permite que participante envie mensagem e deriva o destinatário no servidor', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      tenant_id: TENANT_A,
      tutor_id: TUTOR_A,
      veterinario: { usuario_id: 'vet-user-a' }
    });
    prisma.mensagem.create.mockImplementation(async ({ data }) => ({ id: 'message-a', ...data }));

    const response = await request(app)
      .post('/mensagens')
      .set('Authorization', `Bearer ${tokenFor(TUTOR_A)}`)
      .send({
        solicitacao_id: '11111111-1111-4111-8111-111111111111',
        destinatarioId: '22222222-2222-4222-8222-222222222222',
        conteudo: 'mensagem válida'
      });

    expect(response.status).toBe(201);
    expect(prisma.mensagem.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        tenant_id: TENANT_A,
        remetente_id: TUTOR_A,
        destinatario_id: 'vet-user-a'
      })
    }));
  });
});
