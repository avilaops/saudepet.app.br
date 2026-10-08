const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const prisma = require('../../src/config/database');
const userRoutes = require('../../src/routes/user.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');

describe('autorização administrativa centralizada', () => {
  let app;
  let adminToken;

  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    app = express();
    app.use(express.json());
    app.use('/users', userRoutes);
    app.use(errorHandler);
    adminToken = jwt.sign({ id: 'admin-a' }, process.env.JWT_SECRET);
    prisma.tokenBlacklist.findUnique.mockResolvedValue(null);
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'admin-a',
      tenant_id: 'tenant-a',
      tipo_usuario: 'admin',
      email_verificado: true,
      tenant: { status: 'ativo', expira_em: null },
      veterinario: null
    });
    prisma.tenant.findUnique.mockResolvedValue({ status: 'ativo', expira_em: null, plano: 'premium' });
  });

  it('mantém a rota de estatísticas fora do acesso público', async () => {
    await request(app).get('/users/stats').expect(401);
    expect(prisma.usuario.count).not.toHaveBeenCalled();
  });

  it('impede administrador de clínica de criar outro perfil administrativo', async () => {
    const response = await request(app)
      .post('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        nome: 'Outro Administrador',
        email: 'outro-admin@example.com',
        telefone: '(11) 96666-5555',
        senha: 'SenhaForte@123',
        tipo_usuario: 'admin',
        cidade: 'São Paulo'
      });

    expect(response.status).toBe(403);
    expect(prisma.usuario.create).not.toHaveBeenCalled();
  });

  it('administrador de clínica consulta usuários somente com filtro do próprio tenant', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);

    await request(app)
      .get('/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(prisma.usuario.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { tenant_id: 'tenant-a' }
    }));
  });

  it('não confirma a existência de usuário de outro tenant', async () => {
    prisma.usuario.findFirst.mockResolvedValue(null);

    const response = await request(app)
      .get('/users/user-b')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(prisma.usuario.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'user-b', tenant_id: 'tenant-a' }
    }));
  });
});

export {};
