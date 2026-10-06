const jwt = require('jsonwebtoken');
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/token.service', () => ({
  isTokenBlacklisted: jest.fn().mockResolvedValue(false)
}));

const { authMiddleware } = require('../../../src/middleware/auth.middleware');

const AGORA = Date.now();
const token = (emitidoEm = Math.floor(AGORA / 1000)) =>
  jwt.sign({ id: 'user-1', iat: emitidoEm }, process.env.JWT_SECRET);

const res = () => {
  const r = { statusCode: null, body: null };
  r.status = (code) => { r.statusCode = code; return r; };
  r.json = (payload) => { r.body = payload; return r; };
  return r;
};

const req = (jwtToken) => ({ headers: { authorization: `Bearer ${jwtToken}` } });

function usuario(extra = {}) {
  return {
    id: 'user-1',
    tenant_id: 'tenant-1',
    nome: 'Fulano',
    email: 'fulano@example.com',
    tipo_usuario: 'tutor',
    email_verificado: true,
    sessoes_revogadas_em: null,
    bloqueado: false,
    bloqueado_ate: null,
    bloqueio_motivo: null,
    tenant: { status: 'ativo', expira_em: null },
    veterinario: null,
    ...extra
  };
}

describe('Invalidação de sessão e bloqueio da moderação', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.usuario.findUnique.mockResolvedValue(usuario());
    prisma.usuario.update.mockResolvedValue({});
  });

  it('deixa passar quem não tem corte de sessão nem punição', async () => {
    const next = jest.fn();
    const r = res();
    await authMiddleware(req(token()), r, next);
    expect(next).toHaveBeenCalled();
    expect(r.statusCode).toBeNull();
  });

  it('recusa token emitido ANTES da revogação de sessões', async () => {
    // O caso que fazia "revogar sessões", suspender vet e trocar senha serem
    // só aviso na tela: o access token de 7 dias seguia aceito.
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ sessoes_revogadas_em: new Date(AGORA) })
    );

    const next = jest.fn();
    const r = res();
    await authMiddleware(req(token(Math.floor((AGORA - 60_000) / 1000))), r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(401);
  });

  it('aceita token emitido DEPOIS da revogação — é a sessão nova', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ sessoes_revogadas_em: new Date(AGORA - 60_000) })
    );

    const next = jest.fn();
    await authMiddleware(req(token(Math.floor(AGORA / 1000))), res(), next);
    expect(next).toHaveBeenCalled();
  });

  it('barra quem está com suspensão permanente', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ bloqueado: true, bloqueado_ate: null, bloqueio_motivo: 'Fraude confirmada' })
    );

    const next = jest.fn();
    const r = res();
    await authMiddleware(req(token()), r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(403);
    expect(r.body.motivo).toBe('Fraude confirmada');
  });

  it('barra quem está com suspensão temporária em curso', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ bloqueado: true, bloqueado_ate: new Date(AGORA + 86_400_000) })
    );

    const next = jest.fn();
    const r = res();
    await authMiddleware(req(token()), r, next);

    expect(next).not.toHaveBeenCalled();
    expect(r.statusCode).toBe(403);
  });

  it('libera — e limpa o espelho — quando a suspensão temporária já venceu', async () => {
    prisma.usuario.findUnique.mockResolvedValue(
      usuario({ bloqueado: true, bloqueado_ate: new Date(AGORA - 1000) })
    );

    const next = jest.fn();
    const r = res();
    await authMiddleware(req(token()), r, next);

    expect(next).toHaveBeenCalled();
    expect(r.statusCode).toBeNull();
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { bloqueado: false, bloqueado_ate: null, bloqueio_motivo: null }
    }));
  });

  it('advertência não tira acesso: quem não está bloqueado passa', async () => {
    // `advertencia` e `restricao_funcao` não espelham bloqueio — só as
    // suspensões o fazem.
    prisma.usuario.findUnique.mockResolvedValue(usuario({ bloqueado: false }));

    const next = jest.fn();
    await authMiddleware(req(token()), res(), next);
    expect(next).toHaveBeenCalled();
  });
});
