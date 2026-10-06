// Visita de suporte.
//
// O recurso anterior era um interruptor de PAPEL guardado no navegador: o
// super_admin virava "veterinário" sem ter cadastro de veterinário, e a marca
// sobrevivia à queda da sessão — foi assim que uma conta passou a entrar com a
// senha certa e cair na página pública, sem saída.
const jwt = require('jsonwebtoken');
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const AuditService = require('../../../src/services/audit.service');
const impersonacao = require('../../../src/controllers/impersonacao.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const req = (extra = {}) => ({
  params: {},
  body: {},
  query: {},
  headers: {},
  ip: '1.1.1.1',
  userId: 'admin-1',
  userType: 'super_admin',
  tenantId: 'tenant-1',
  ...extra
});

const tutor = (extra = {}) => ({
  id: 'user-tutor',
  nome: 'Maria',
  email: 'maria@x.com',
  tipo_usuario: 'tutor',
  tenant_id: 'tenant-1',
  ativo: true,
  ...extra
});

beforeEach(() => jest.clearAllMocks());

describe('Entrar na conta de alguém', () => {
  it('emite token da pessoa visitada, carregando quem está por trás', async () => {
    prisma.usuario.findFirst.mockResolvedValue(tutor());

    const r = res();
    await impersonacao.entrar(
      req({ params: { usuarioId: 'user-tutor' }, body: { motivo: 'Tutor relatou pet sumido da lista' } }),
      r, next
    );

    const { access_token, refresh_token } = r.json.mock.calls[0][0];
    const conteudo = jwt.verify(access_token, process.env.JWT_SECRET);

    expect(conteudo.id).toBe('user-tutor');
    expect(conteudo.tipo_usuario).toBe('tutor');
    // Sem quem está por trás, tudo apareceria como ato da própria pessoa.
    expect(conteudo.impersonado_por).toBe('admin-1');
    // Sem refresh: a visita termina quando termina.
    expect(refresh_token).toBeNull();
  });

  it('a visita expira sozinha', async () => {
    prisma.usuario.findFirst.mockResolvedValue(tutor());

    const r = res();
    await impersonacao.entrar(
      req({ params: { usuarioId: 'user-tutor' }, body: { motivo: 'Conferir cadastro' } }), r, next
    );

    const { exp, iat } = jwt.verify(r.json.mock.calls[0][0].access_token, process.env.JWT_SECRET);
    expect(exp - iat).toBe(3600);
  });

  it('exige motivo — fica registrado', async () => {
    await expect(impersonacao.entrar(
      req({ params: { usuarioId: 'user-tutor' }, body: { motivo: 'x' } }), res(), next
    )).rejects.toThrow(/por que/i);
  });

  it('registra a entrada na trilha, com o motivo', async () => {
    prisma.usuario.findFirst.mockResolvedValue(tutor());

    await impersonacao.entrar(
      req({ params: { usuarioId: 'user-tutor' }, body: { motivo: 'Tutor não vê o pet' } }), res(), next
    );

    expect(AuditService.logForensicEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'suporte.impersonacao_iniciada',
      motivo: 'Tutor não vê o pet'
    }));
  });

  it('não entra na conta de outro admin — seria escalar privilégio', async () => {
    prisma.usuario.findFirst.mockResolvedValue(tutor({ tipo_usuario: 'admin' }));

    await expect(impersonacao.entrar(
      req({ params: { usuarioId: 'outro-admin' }, body: { motivo: 'Motivo qualquer' } }), res(), next
    )).rejects.toThrow(/tutores e veterinários/i);
  });

  it('não entra em conta inativa', async () => {
    prisma.usuario.findFirst.mockResolvedValue(tutor({ ativo: false }));

    await expect(impersonacao.entrar(
      req({ params: { usuarioId: 'user-tutor' }, body: { motivo: 'Motivo qualquer' } }), res(), next
    )).rejects.toThrow(/inativa/i);
  });

  it('não alcança usuário de outro tenant', async () => {
    prisma.usuario.findFirst.mockResolvedValue(null);

    await expect(impersonacao.entrar(
      req({ params: { usuarioId: 'de-outro-tenant' }, body: { motivo: 'Motivo qualquer' } }), res(), next
    )).rejects.toThrow(/não encontrado/i);
    expect(prisma.usuario.findFirst.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
  });
});

describe('Quem pode ser visitado', () => {
  it('lista só tutores e veterinários ativos do tenant', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);

    await impersonacao.listarAlvos(req({ query: {} }), res(), next);

    const where = prisma.usuario.findMany.mock.calls[0][0].where;
    expect(where.tipo_usuario).toEqual({ in: ['tutor', 'veterinario'] });
    expect(where.ativo).toBe(true);
    expect(where.tenant_id).toBe('tenant-1');
  });

  it('busca por nome ou e-mail', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);

    await impersonacao.listarAlvos(req({ query: { busca: 'maria' } }), res(), next);

    expect(prisma.usuario.findMany.mock.calls[0][0].where.OR).toHaveLength(2);
  });
});

describe('Encerrar a visita', () => {
  it('registra o fim com o admin como ator', async () => {
    await impersonacao.sair(
      req({ userId: 'user-tutor', userType: 'tutor', impersonadoPor: 'admin-1' }), res(), next
    );

    expect(AuditService.logForensicEvent).toHaveBeenCalledWith(expect.objectContaining({
      action: 'suporte.impersonacao_encerrada',
      actorUserId: 'admin-1'
    }));
  });

  it('recusa quando a sessão não é uma visita', async () => {
    await expect(impersonacao.sair(req(), res(), next)).rejects.toThrow(/não é uma visita/i);
  });
});
