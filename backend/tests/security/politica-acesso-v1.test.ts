/**
 * Política de acesso v1.0: quem entra, quem não entra, e por qual porta.
 *
 * Tutor entra com a conta criada. Veterinário só com e-mail confirmado E
 * aprovação do admin — em login por senha, refresh e Google.
 */
const express = require('express');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const prisma = require('../../src/config/database');
const authRoutes = require('../../src/routes/auth.routes');
const { errorHandler } = require('../../src/middleware/error.middleware');
const {
  motivoDeBloqueio,
  statusContaVeterinario,
  garantirPodeEntrar
} = require('../../src/services/politica-acesso.service');

function app() {
  const a = express();
  a.use(express.json());
  a.use('/auth', authRoutes);
  a.use(errorHandler);
  return a;
}

async function vet(extra: any = {}, credenciamento: any = {}) {
  const senha = await bcrypt.hash('Senha@123', 10);
  return {
    id: 'vet-user',
    tenant_id: 'tenant-a',
    email: 'vet@example.com',
    senha,
    tipo_usuario: 'veterinario',
    email_verificado: true,
    tenant: { status: 'ativo' },
    veterinario: { id: 'vet-1', aprovado_admin: true, status_credenciamento: 'APPROVED', ...credenciamento },
    ...extra
  };
}

describe('politica-acesso.service', () => {
  beforeEach(() => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
  });

  it('tutor entra sem verificação quando a flag está desligada', () => {
    expect(motivoDeBloqueio({ tipo_usuario: 'tutor', email_verificado: false })).toBeNull();
  });

  it('tutor precisa confirmar e-mail quando a flag está ligada', () => {
    process.env.REQUIRE_EMAIL_VERIFICATION = 'true';
    expect(motivoDeBloqueio({ tipo_usuario: 'tutor', email_verificado: false })).toBe('EMAIL_NAO_VERIFICADO');
    expect(motivoDeBloqueio({ tipo_usuario: 'tutor', email_verificado: true })).toBeNull();
  });

  it('veterinário precisa de e-mail confirmado mesmo com a flag desligada', () => {
    expect(motivoDeBloqueio({
      tipo_usuario: 'veterinario', email_verificado: false,
      veterinario: { aprovado_admin: true, status_credenciamento: 'APPROVED' }
    })).toBe('VET_EMAIL_NAO_VERIFICADO');
  });

  it('veterinário pendente, recusado e suspenso não entram; aprovado entra', () => {
    const base = { tipo_usuario: 'veterinario', email_verificado: true };
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: false, status_credenciamento: 'PENDING_REVIEW' } })).toBe('VET_PENDENTE');
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: false, status_credenciamento: 'REJECTED' } })).toBe('VET_RECUSADA');
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: false, status_credenciamento: 'SUSPENDED' } })).toBe('VET_BLOQUEADA');
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: true, status_credenciamento: 'APPROVED' } })).toBeNull();
  });

  it('tenant que dispensa aprovação libera o pendente, mas não o suspenso', () => {
    const base = { tipo_usuario: 'veterinario', email_verificado: true };
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: false, status_credenciamento: 'PENDING_REVIEW' } }, { requerAprovacaoVet: false })).toBeNull();
    expect(motivoDeBloqueio({ ...base, veterinario: { aprovado_admin: false, status_credenciamento: 'SUSPENDED' } }, { requerAprovacaoVet: false })).toBe('VET_BLOQUEADA');
  });

  it('mapeia o status granular para os quatro estados da v1.0', () => {
    expect(statusContaVeterinario({ status_credenciamento: 'PENDING_REVIEW' })).toBe('pendente');
    expect(statusContaVeterinario({ status_credenciamento: 'APPROVED' })).toBe('aprovada');
    expect(statusContaVeterinario({ status_credenciamento: 'REJECTED' })).toBe('recusada');
    expect(statusContaVeterinario({ status_credenciamento: 'SUSPENDED' })).toBe('bloqueada');
  });

  it('garantirPodeEntrar lança 403 com código', () => {
    expect.assertions(2);
    try {
      garantirPodeEntrar({ tipo_usuario: 'veterinario', email_verificado: false, veterinario: {} });
    } catch (erro: any) {
      expect(erro.statusCode).toBe(403);
      expect(erro.codigo).toBe('VET_EMAIL_NAO_VERIFICADO');
    }
  });
});

describe('POST /auth/login — veterinário', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    prisma.auditLog.create.mockResolvedValue({});
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a', status: 'ativo' });
    prisma.configuracaoTenant.findUnique.mockResolvedValue({ requer_aprovacao_vet: true });
    prisma.refreshToken.create.mockResolvedValue({ token: 'refresh' });
  });

  const login = () => request(app()).post('/auth/login').send({
    email: 'vet@example.com', senha: 'Senha@123', tenant_slug: 'tenant-a'
  });

  it('barra veterinário com e-mail não confirmado, mesmo aprovado', async () => {
    prisma.usuario.findFirst.mockResolvedValue(await vet({ email_verificado: false }));
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.access_token).toBeUndefined();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
    // A tentativa fica na auditoria, sem a senha.
    const registro = prisma.auditLog.create.mock.calls[0][0].data;
    expect(JSON.stringify(registro)).not.toContain('Senha@123');
  });

  it('barra veterinário pendente de aprovação', async () => {
    prisma.usuario.findFirst.mockResolvedValue(await vet({}, { aprovado_admin: false, status_credenciamento: 'PENDING_REVIEW' }));
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/não foi aprovada/i);
  });

  it('barra veterinário suspenso', async () => {
    prisma.usuario.findFirst.mockResolvedValue(await vet({}, { aprovado_admin: false, status_credenciamento: 'SUSPENDED' }));
    const res = await login();
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/bloqueada/i);
  });

  it('deixa entrar o veterinário aprovado com e-mail confirmado', async () => {
    prisma.usuario.findFirst.mockResolvedValue(await vet());
    const res = await login();
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeTruthy();
    expect(res.body.usuario.senha).toBeUndefined();
  });

  it('conta criada pelo Google (sem senha) responde 401, não 500', async () => {
    prisma.usuario.findFirst.mockResolvedValue({
      id: 'g', tenant_id: 'tenant-a', email: 'vet@example.com', senha: null,
      tipo_usuario: 'tutor', email_verificado: true, tenant: { status: 'ativo' }, veterinario: null
    });
    const res = await login();
    expect(res.status).toBe(401);
  });
});

describe('POST /auth/refresh — veterinário', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    prisma.refreshToken.findUnique.mockResolvedValue({
      id: 'r', token: 'refresh-vet', usuario_id: 'vet-user', expira_em: new Date(Date.now() + 60_000)
    });
    prisma.refreshToken.deleteMany.mockResolvedValue({ count: 1 });
    prisma.refreshToken.create.mockResolvedValue({ token: 'novo' });
  });

  it('suspenso não renova sessão e perde os refresh tokens', async () => {
    prisma.usuario.findUnique.mockResolvedValue({
      id: 'vet-user', tenant_id: 'tenant-a', tipo_usuario: 'veterinario', email_verificado: true,
      veterinario: { aprovado_admin: false, status_credenciamento: 'SUSPENDED' },
      tenant: { status: 'ativo', expira_em: null, configuracoes: { requer_aprovacao_vet: true } }
    });
    const res = await request(app()).post('/auth/refresh').send({ refresh_token: 'refresh-vet' });
    expect(res.status).toBe(403);
    expect(prisma.refreshToken.deleteMany).toHaveBeenCalled();
    expect(prisma.refreshToken.create).not.toHaveBeenCalled();
  });
});

describe('POST /auth/register — veterinário', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.REQUIRE_EMAIL_VERIFICATION = 'false';
    prisma.tenant.findUnique.mockResolvedValue({
      id: 'tenant-a', slug: 'saudepet', status: 'ativo', limite_usuarios: 100, configuracoes: { permitir_cadastro: true }
    });
    prisma.usuario.count.mockResolvedValue(0);
    prisma.usuario.findFirst.mockResolvedValue(null);
    prisma.usuario.create.mockResolvedValue({ id: 'novo', nome: 'Dra. Ana', email: 'ana@example.com', tipo_usuario: 'veterinario' });
    prisma.veterinario.create.mockResolvedValue({ id: 'vet-novo' });
    prisma.emailVerificationToken.deleteMany.mockResolvedValue({});
    prisma.emailVerificationToken.create.mockResolvedValue({});
    prisma.auditLog.create.mockResolvedValue({});
  });

  const corpo = {
    tipo_usuario: 'veterinario', nome: 'Dra. Ana', email: 'ana@example.com', telefone: '(11) 99999-9999',
    senha: 'Senha@123', crmv: '12345', crmv_uf: 'sp', especialidade: 'Clínica geral', tenant_slug: 'saudepet'
  };

  it('exige CRMV, UF, especialidade e telefone', async () => {
    const res = await request(app()).post('/auth/register').send({ ...corpo, crmv_uf: undefined, telefone: undefined });
    expect(res.status).toBe(400);
    const campos = res.body.details.map((d: any) => d.field);
    expect(campos).toEqual(expect.arrayContaining(['crmv_uf', 'telefone']));
  });

  it('rejeita UF inexistente', async () => {
    const res = await request(app()).post('/auth/register').send({ ...corpo, crmv_uf: 'XX' });
    expect(res.status).toBe(400);
    expect(res.body.details[0].field).toBe('crmv_uf');
  });

  it('cria o veterinário pendente, com UF normalizada, e NÃO devolve sessão', async () => {
    const res = await request(app()).post('/auth/register').send(corpo);
    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeNull();
    expect(res.body.refresh_token).toBeNull();
    const dados = prisma.veterinario.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({ crmv: '12345', crmv_uf: 'SP', aprovado_admin: false, status_credenciamento: 'PENDING_REVIEW' });
    // A senha nunca vai para o banco em claro.
    expect(prisma.usuario.create.mock.calls[0][0].data.senha).not.toBe('Senha@123');
  });
});

describe('POST /auth/login — limite por conta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TESTAR_LIMITE_POR_CONTA = 'true';
    prisma.auditLog.create.mockResolvedValue({});
    prisma.tenant.findUnique.mockResolvedValue({ id: 'tenant-a', status: 'ativo' });
    prisma.usuario.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    delete process.env.TESTAR_LIMITE_POR_CONTA;
  });

  it('depois de 10 falhas na mesma conta responde 429, sem afetar outra conta', async () => {
    const a = app();
    for (let i = 0; i < 10; i += 1) {
      const res = await request(a).post('/auth/login').send({ email: 'alvo@example.com', senha: `errada${i}`, tenant_slug: 'tenant-a' });
      expect(res.status).toBe(401);
    }
    const bloqueado = await request(a).post('/auth/login').send({ email: 'ALVO@example.com', senha: 'errada', tenant_slug: 'tenant-a' });
    expect(bloqueado.status).toBe(429);
    expect(bloqueado.body.error).toMatch(/tentativas/i);

    const outra = await request(a).post('/auth/login').send({ email: 'outra@example.com', senha: 'errada', tenant_slug: 'tenant-a' });
    expect(outra.status).toBe(401);
  });
});
