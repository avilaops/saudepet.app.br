// A punição da moderação não punia: `Punicao` e `banido` eram gravados e nada
// no sistema os lia. Estes testes travam o espelho que o authMiddleware usa.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const moderacao = require('../../../src/controllers/moderacao.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const req = (body) => ({ body, params: {}, user: { id: 'admin-1', tenant_id: 'tenant-1' } });

beforeEach(() => {
  jest.clearAllMocks();
  prisma.violacao.findFirst.mockResolvedValue({ id: 'v1', status: 'confirmada' });
  prisma.punicao.create.mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }));
  prisma.historicoModeracaoUsuario.update.mockResolvedValue({});
  prisma.historicoModeracaoUsuario.upsert.mockResolvedValue({});
  prisma.historicoModeracaoUsuario.findUnique.mockResolvedValue(null);
  prisma.violacao.count.mockResolvedValue(0);
  prisma.punicao.count.mockResolvedValue(0);
  prisma.violacao.findMany.mockResolvedValue([]);
  prisma.punicao.findMany.mockResolvedValue([]);
  prisma.usuario.update.mockResolvedValue({});
});

describe('Aplicar punição', () => {
  it('suspensão permanente bloqueia o usuário e derruba a sessão', async () => {
    await moderacao.aplicarPunicao(
      req({ usuario_id: 'u1', violacao_id: 'v1', tipo: 'suspensao_perm', motivo: 'Fraude' }),
      res(),
      next
    );

    const dados = prisma.usuario.update.mock.calls[0][0];
    expect(dados.where).toEqual({ id: 'u1' });
    expect(dados.data.bloqueado).toBe(true);
    expect(dados.data.bloqueado_ate).toBeNull();
    expect(dados.data.bloqueio_motivo).toBe('Fraude');
    expect(dados.data.sessoes_revogadas_em).toBeInstanceOf(Date);
  });

  it('suspensão temporária grava a data em que o acesso volta', async () => {
    await moderacao.aplicarPunicao(
      req({ usuario_id: 'u1', violacao_id: 'v1', tipo: 'suspensao_temp', motivo: 'Abuso', dias_suspensao: 7 }),
      res(),
      next
    );

    const dados = prisma.usuario.update.mock.calls[0][0].data;
    expect(dados.bloqueado).toBe(true);
    expect(dados.bloqueado_ate).toBeInstanceOf(Date);
  });

  it('advertência não tira acesso de ninguém', async () => {
    await moderacao.aplicarPunicao(
      req({ usuario_id: 'u1', violacao_id: 'v1', tipo: 'advertencia', motivo: 'Linguagem' }),
      res(),
      next
    );

    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });
});

describe('Revogar punição', () => {
  const reqRevogar = {
    params: { id: 'p1' },
    body: { motivo_revogacao: 'Recurso aceito' },
    user: { id: 'admin-1', tenant_id: 'tenant-1' }
  };

  beforeEach(() => {
    prisma.punicao.findFirst.mockResolvedValue({
      id: 'p1', usuario_id: 'u1', tipo: 'suspensao_temp', ativa: true
    });
    prisma.punicao.update.mockResolvedValue({ id: 'p1', ativa: false });
  });

  it('devolve o acesso quando não sobra nenhuma outra suspensão ativa', async () => {
    prisma.punicao.findFirst
      .mockResolvedValueOnce({ id: 'p1', usuario_id: 'u1', tipo: 'suspensao_temp', ativa: true })
      .mockResolvedValueOnce(null);

    await moderacao.revogarPunicao(reqRevogar, res(), next);

    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { bloqueado: false, bloqueado_ate: null, bloqueio_motivo: null }
    });
  });

  it('mantém o bloqueio quando o usuário ainda tem outra suspensão ativa', async () => {
    prisma.punicao.findFirst
      .mockResolvedValueOnce({ id: 'p1', usuario_id: 'u1', tipo: 'suspensao_temp', ativa: true })
      .mockResolvedValueOnce({ id: 'p2', tipo: 'suspensao_perm' });

    await moderacao.revogarPunicao(reqRevogar, res(), next);

    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });
});

export {};
