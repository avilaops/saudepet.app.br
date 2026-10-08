const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const prisma = require('../../src/config/database');
const authRoutes = require('../../src/routes/auth.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

describe('estado de conta na autenticação e renovação', () => {
  let app;

  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);
    app.use(errorHandler);
    prisma.auditLog.create.mockResolvedValue({});
  });

  it('não permite login de conta não verificada nem emite refresh token', async () => {
    const senha = await bcrypt.hash('Senha@123', 10);
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a', status: 'ativo' });
    prisma.usuario.findFirst.mockResolvedValue({
      id: 'user-a',
      tenant_id: 'tenant-a',
      email: 'user@example.com',
      senha,
      tipo_usuario: 'tutor',
      email_verificado: false,
      tenant: { status: 'ativo' },
      veterinario: null
    });

    const response = await request(app).post('/auth/login').send({
      email: 'user@example.com',
      senha: 'Senha@123',
      tenant_slug: 'tenant-a'
    });

    expect(response.status).toBe(403);
    expect(response.body.access_token).toBeUndefined();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });

  it('refresh token não contorna verificação de email', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-a',
      token: 'refresh-a',
      usuario_id: 'user-a',
      expira_em: new Date(Date.now() + 60_000)
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'user-a',
      tenant_id: 'tenant-a',
      tipo_usuario: 'tutor',
      email_verificado: false,
      tenant: { status: 'ativo', expira_em: null, configuracoes: { requer_aprovacao_vet: true } },
      veterinario: null
    });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(app).post('/auth/refresh').send({ refresh_token: 'refresh-a' });

    expect(response.status).toBe(403);
    expect(response.body.access_token).toBeUndefined();
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { usuario_id: 'user-a' } });
  });

  it('refresh token não contorna suspensão do tenant', async () => {
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'refresh-a',
      token: 'refresh-a',
      usuario_id: 'user-a',
      expira_em: new Date(Date.now() + 60_000)
    });
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'user-a',
      tenant_id: 'tenant-a',
      tipo_usuario: 'tutor',
      email_verificado: true,
      tenant: { status: 'suspenso', expira_em: null, configuracoes: { requer_aprovacao_vet: true } },
      veterinario: null
    });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });

    const response = await request(app).post('/auth/refresh').send({ refresh_token: 'refresh-a' });

    expect(response.status).toBe(403);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalledWith({ where: { usuario_id: 'user-a' } });
  });
});

export {};
