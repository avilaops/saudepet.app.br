const request = require('supertest');
const express = require('express');
const formularioRoutes = require('../../src/routes/formulario.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

jest.mock('../../src/config/database', () => ({
  formulario: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    count: jest.fn(),
  },
  respostaFormulario: {
    create: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  // authMiddleware/tenantContext recarregam usuário e tenant do banco a cada
  // request (Fase 1 de segurança) — sem esses o middleware nunca autentica.
  usuario: {
    findUnique: jest.fn(),
  },
  tenant: {
    findUnique: jest.fn(),
  },
  tokenBlacklist: {
    findUnique: jest.fn(),
  },
}));

const prisma = require('../../src/config/database');
const jwt = require('jsonwebtoken');

describe('Formulário Routes', () => {
  let app;
  let adminToken;
  let userToken;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/formularios', formularioRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();

    // Gerar tokens
    adminToken = jwt.sign(
      { id: 'admin-1', tipo_usuario: 'admin', tenant_id: 'tenant-1' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    userToken = jwt.sign(
      { id: 'user-1', tipo_usuario: 'tutor', tenant_id: 'tenant-1' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    const usuariosPorId = {
      'admin-1': { id: 'admin-1', tenant_id: 'tenant-1', tipo_usuario: 'admin', email_verificado: true },
      'user-1': { id: 'user-1', tenant_id: 'tenant-1', tipo_usuario: 'tutor', email_verificado: true }
    };
    prisma.usuario.findUnique.mockImplementation(({ where }) => {
      const usuario = usuariosPorId[where.id];
      if (!usuario) return Promise.resolve(null);
      return Promise.resolve({ ...usuario, tenant: { status: 'ativo', expira_em: null }, veterinario: null });
    });
    prisma.tenant.findUnique.mockResolvedValue({ status: 'ativo', expira_em: null, plano: 'premium' });
  });

  describe('POST /api/v1/formularios', () => {
    it('deve criar formulário com sucesso (admin)', async () => {
      const mockFormulario = {
        id: 'form-1',
        titulo: 'Pré-Consulta',
        tipo: 'pre_consulta',
        campos: JSON.stringify([
          { id: 'campo1', tipo: 'texto', label: 'Nome' }
        ])
      };

      prisma.formulario.create.mockResolvedValue(mockFormulario);

      const response = await request(app)
        .post('/api/v1/formularios')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          titulo: 'Pré-Consulta',
          tipo: 'pre_consulta',
          campos: [
            { id: 'campo1', tipo: 'texto', label: 'Nome', obrigatorio: true }
          ]
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('formulario');
    });

    it('deve retornar erro 403 para usuário não-admin', async () => {
      const response = await request(app)
        .post('/api/v1/formularios')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          titulo: 'Teste',
          tipo: 'pre_consulta',
          campos: []
        });

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/v1/formularios', () => {
    it('deve listar formulários com paginação', async () => {
      prisma.formulario.findMany.mockResolvedValue([
        { id: '1', titulo: 'Form 1', campos: '[]' },
        { id: '2', titulo: 'Form 2', campos: '[]' }
      ]);
      prisma.formulario.count.mockResolvedValue(2);

      const response = await request(app)
        .get('/api/v1/formularios?page=1&limit=10')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('formularios');
      expect(response.body).toHaveProperty('paginacao');
      expect(response.body.formularios).toHaveLength(2);
    });
  });
});
