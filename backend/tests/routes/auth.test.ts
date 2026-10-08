const request = require('supertest');
const express = require('express');
const authRoutes = require('../../src/routes/auth.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

// Mock do Prisma
jest.mock('../../src/config/database', () => ({
  usuario: {
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    count: jest.fn()
  },
  tenant: {
    findUnique: jest.fn(),
  },
  veterinario: { create: jest.fn() },
  refreshToken: { create: jest.fn(), findUnique: jest.fn(), delete: jest.fn(), deleteMany: jest.fn() },
  emailVerificationToken: { deleteMany: jest.fn(), create: jest.fn() },
  tokenBlacklist: { findUnique: jest.fn(), create: jest.fn() },
  auditLog: { create: jest.fn() }
}));

const prisma = require('../../src/config/database');

describe('Auth Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/v1/auth', authRoutes);
    app.use(errorHandler);
    jest.clearAllMocks();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-1',
      slug: 'clinica-demo',
      status: 'ativo',
      limite_usuarios: 10,
      configuracoes: { permitir_cadastro: true }
    });
    prisma.usuario.count.mockResolvedValue(0);
    prisma.refreshToken.create.mockResolvedValue({ token: 'refresh-token-test' });
    prisma.emailVerificationToken.create.mockResolvedValue({});
    prisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    prisma.auditLog.create.mockResolvedValue({});
  });

  describe('POST /api/v1/auth/register', () => {
    it('deve registrar um novo tutor com sucesso', async () => {
      // Mock do tenant
      // Mock de verificação de usuário existente (email e telefone)
      prisma.usuario.findFirst
        .mockResolvedValueOnce(null) // Primeira verificação: email
        .mockResolvedValueOnce(null); // Segunda verificação: telefone

      // Mock de criação de usuário
      prisma.usuario.create.mockResolvedValue({
        id: 'user-1',
        nome: 'João Silva',
        email: 'joao@test.com',
        telefone: '(11) 99999-9999',
        tipo_usuario: 'tutor',
        tenant_id: 'tenant-1'
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'João Silva',
          email: 'joao@test.com',
          telefone: '(11) 99999-9999',
          senha: 'Senha@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('usuario');
      expect(response.body).toHaveProperty('access_token');
    });

    it.each(['admin', 'super_admin'])('bloqueia cadastro público como %s sem emitir token privilegiado', async (tipo_usuario) => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'Usuário Privilegiado',
          email: `${tipo_usuario}@test.com`,
          telefone: '(11) 98888-7777',
          senha: 'Senha@123',
          tipo_usuario,
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(400);
      expect(response.body.access_token).toBeUndefined();
      expect(response.body.refresh_token).toBeUndefined();
      expect(prisma.usuario.create).not.toHaveBeenCalled();
    });

    it('não emite sessão antes da verificação quando a exigência está ativa', async () => {
      process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
      prisma.usuario.findFirst.mockResolvedValue(null);
      prisma.usuario.create.mockResolvedValue({
        id: 'user-unverified',
        nome: 'Maria Silva',
        email: 'maria@test.com',
        telefone: '(11) 97777-6666',
        tipo_usuario: 'tutor',
        tenant_id: 'tenant-1',
        cidade: 'São Paulo'
      });

      const response = await request(app).post('/api/v1/auth/register').send({
        nome: 'Maria Silva',
        email: 'maria@test.com',
        telefone: '(11) 97777-6666',
        senha: 'Senha@123',
        tipo_usuario: 'tutor',
        cidade: 'São Paulo',
        tenant_slug: 'clinica-demo'
      });

      expect(response.status).toBe(201);
      expect(response.body.access_token).toBeNull();
      expect(response.body.refresh_token).toBeNull();
      expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    });

    it('deve retornar erro 400 para dados inválidos', async () => {
      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'Jo', // Nome muito curto
          email: 'email-invalido',
          senha: '123' // Senha fraca
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('deve retornar erro 409 para email duplicado', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        slug: 'clinica-demo',
        status: 'ativo',
        configuracoes: {
          permitir_cadastro: true
        }
      });

      // Mock encontrando usuário existente
      prisma.usuario.findFirst.mockResolvedValue({
        id: 'existing-user',
        email: 'joao@test.com'
      });

      const response = await request(app)
        .post('/api/v1/auth/register')
        .send({
          nome: 'João Silva',
          email: 'joao@test.com',
          telefone: '(11) 99999-9999',
          senha: 'Senha@123',
          tipo_usuario: 'tutor',
          cidade: 'São Paulo',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(409);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it('deve fazer login com sucesso', async () => {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('Senha@123', 10);

      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        slug: 'clinica-demo',
        status: 'ativo',
        configuracoes: {
          permitir_cadastro: true
        }
      });

      prisma.usuario.findFirst.mockResolvedValue({
        id: 'user-1',
        nome: 'João Silva',
        email: 'joao@test.com',
        senha: hashedPassword,
        tipo_usuario: 'tutor',
        tenant_id: 'tenant-1',
        veterinario: null
      });

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'joao@test.com',
          senha: 'Senha@123',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('usuario');
      expect(response.body).toHaveProperty('access_token');
    });

    it('deve retornar erro 401 para credenciais inválidas', async () => {
      prisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-1',
        slug: 'clinica-demo',
        status: 'ativo'
      });

      prisma.usuario.findFirst.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/v1/auth/login')
        .send({
          email: 'naoexiste@test.com',
          senha: 'Senha@123',
          tenant_slug: 'clinica-demo'
        });

      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/v1/auth/me', () => {
    it('deve retornar dados do usuário autenticado', async () => {
      prisma.usuario.findUnique.mockResolvedValue({
        id: 'user-1',
        tenant_id: 'tenant-1',
        nome: 'João Silva',
        email: 'joao@test.com',
        tipo_usuario: 'tutor',
        email_verificado: true,
        tenant: {
          id: 'tenant-1',
          nome: 'Clínica Demo',
          status: 'ativo',
          expira_em: null
        },
        veterinario: null
      });

      // Gerar token válido
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(
        { id: 'user-1', tipo_usuario: 'tutor' },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('nome');
      expect(response.body).toHaveProperty('email');
      expect(response.body.id).toBe('user-1');
    });

    it('deve retornar erro 401 sem token', async () => {
      const response = await request(app)
        .get('/api/v1/auth/me');

      expect(response.status).toBe(401);
    });
  });
});

export {};
