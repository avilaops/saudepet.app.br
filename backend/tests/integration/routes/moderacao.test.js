const request = require('supertest');
const { createTestApp, expectSuccessResponse, expectErrorResponse } = require('../../helpers/utils');
const { fixtures, generateToken } = require('../../helpers/fixtures');
const moderacaoRoutes = require('../../../src/routes/moderacao.routes');

jest.mock('../../../src/config/database');
const prisma = require('../../../src/config/database');

describe('Moderação Routes - Integration', () => {
  let app;
  let adminToken;
  let userToken;

  beforeEach(() => {
    app = createTestApp({
      '/api/v1/moderacao': moderacaoRoutes
    });

    adminToken = generateToken(fixtures.usuarios.admin);
    userToken = generateToken(fixtures.usuarios.tutor);

    // authMiddleware recarrega o usuário do banco a cada request (Fase 1 de
    // segurança) — sem isso o mock global do Prisma devolve undefined e tudo vira 401.
    const usuariosPorId = {
      [fixtures.usuarios.admin.id]: fixtures.usuarios.admin,
      [fixtures.usuarios.tutor.id]: fixtures.usuarios.tutor
    };
    prisma.usuario.findUnique.mockImplementation(({ where }) => {
      const usuario = usuariosPorId[where.id];
      if (!usuario) return Promise.resolve(null);
      return Promise.resolve({
        ...usuario,
        tenant: { status: fixtures.tenants.clinicaDemo.status, expira_em: null },
        veterinario: null
      });
    });
    // requireActiveTenant faz sua própria consulta de tenant, independente do
    // usuario.findUnique acima.
    prisma.tenant.findUnique.mockResolvedValue({
      status: fixtures.tenants.clinicaDemo.status,
      expira_em: null,
      plano: fixtures.tenants.clinicaDemo.plano
    });

    // reportarViolacao/aplicarPunicao chamam atualizarHistoricoUsuario(), que por sua
    // vez lê violacao/punicao e faz upsert em historicoModeracaoUsuario — sem esses
    // defaults o mock automático devolve undefined e o controller quebra com 500.
    prisma.violacao.findMany.mockResolvedValue([]);
    prisma.punicao.findMany.mockResolvedValue([]);
    prisma.historicoModeracaoUsuario.upsert.mockResolvedValue({
      tenant_id: fixtures.tenants.clinicaDemo.id,
      usuario_id: 'usuario-alvo',
      total_violacoes: 0,
      total_pontos: 0,
      advertencias: 0,
      suspensoes_temp: 0,
      suspensoes_perm: 0,
      banido: false
    });
  });

  describe('POST /api/v1/moderacao/reportar', () => {
    it('deve reportar violação com sucesso', async () => {
      prisma.usuario.findFirst.mockResolvedValue(fixtures.usuarios.veterinario);
      prisma.violacao.create.mockResolvedValue({
        id: 'viol-1',
        tipo: 'spam',
        descricao: 'Enviou spam',
        gravidade: 3
      });

      const response = await request(app)
        .post('/api/v1/moderacao/reportar')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          usuario_id: '11111111-1111-4111-8111-111111111111',
          tipo: 'spam',
          descricao: 'Usuário enviando spam no chat',
          gravidade: 3
        });

      expectSuccessResponse(response, 201, ['violacao']);
    });

    it('deve retornar erro ao reportar a si mesmo', async () => {
      const response = await request(app)
        .post('/api/v1/moderacao/reportar')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          usuario_id: 'tutor-1', // Mesmo ID do usuário logado
          tipo: 'spam',
          descricao: 'Test'
        });

      expectErrorResponse(response, 400);
    });
  });

  describe('GET /api/v1/moderacao/violacoes', () => {
    it('deve listar violações (admin)', async () => {
      prisma.violacao.findMany.mockResolvedValue([
        { id: '1', tipo: 'spam', status: 'pendente' },
        { id: '2', tipo: 'abuso_verbal', status: 'confirmada' }
      ]);
      prisma.violacao.count.mockResolvedValue(2);

      const response = await request(app)
        .get('/api/v1/moderacao/violacoes?status=pendente')
        .set('Authorization', `Bearer ${adminToken}`);

      expectSuccessResponse(response, 200, ['violacoes', 'paginacao']);
    });

    it('deve retornar erro 403 para não-admin', async () => {
      const response = await request(app)
        .get('/api/v1/moderacao/violacoes')
        .set('Authorization', `Bearer ${userToken}`);

      expectErrorResponse(response, 403);
    });
  });

  describe('POST /api/v1/moderacao/punicoes', () => {
    it('deve aplicar punição (admin)', async () => {
      prisma.violacao.findFirst.mockResolvedValue({
        id: 'viol-1',
        status: 'confirmada'
      });
      prisma.punicao.create.mockResolvedValue({
        id: 'pun-1',
        tipo: 'advertencia',
        motivo: 'Primeira violação'
      });

      const response = await request(app)
        .post('/api/v1/moderacao/punicoes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          usuario_id: '11111111-1111-4111-8111-111111111111',
          violacao_id: '22222222-2222-4222-8222-222222222222',
          tipo: 'advertencia',
          motivo: 'Primeira violação'
        });

      expectSuccessResponse(response, 201, ['punicao']);
    });
  });

  describe('GET /api/v1/moderacao/meu-status', () => {
    it('deve retornar status de moderação do usuário', async () => {
      prisma.historicoModeracaoUsuario.findUnique.mockResolvedValue({
        total_violacoes: 0,
        total_pontos: 0,
        banido: false
      });
      prisma.punicao.findMany.mockResolvedValue([]);

      const response = await request(app)
        .get('/api/v1/moderacao/meu-status')
        .set('Authorization', `Bearer ${userToken}`);

      expectSuccessResponse(response, 200, ['historico', 'punicoes_ativas']);
    });
  });
});
