// Intervenção da administração num atendimento travado.
//
// Um chamado preso em `procurando_veterinario` — praça sem ninguém online, ou
// vet que aceitou e sumiu — não tinha NENHUMA saída pelo painel: o admin via o
// problema na torre de controle e precisava mexer no banco, enquanto o tutor
// ficava impedido de abrir outro (o sistema recusa nova solicitação enquanto
// houver uma ativa).
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/atendimento-state.service', () => {
  const real = jest.requireActual('../../../src/services/atendimento-state.service');
  return { ...real, transicionar: jest.fn() };
});
jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));
jest.mock('../../../src/services/push.service', () => ({ enviarParaUsuario: jest.fn() }));

const { transicionar } = require('../../../src/services/atendimento-state.service');
const pushService = require('../../../src/services/push.service');
const admin = require('../../../src/controllers/admin.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const emits = [];
const io = { to: (sala) => ({ emit: (evento, dados) => emits.push({ sala, evento, dados }) }) };

const req = (extra = {}) => ({
  params: { id: 'atend-1' },
  body: {},
  query: {},
  headers: {},
  ip: '1.1.1.1',
  userId: 'admin-1',
  tenantId: 'tenant-1',
  app: { get: () => io },
  ...extra
});

const atendimento = (extra = {}) => ({
  id: 'atend-1',
  status: 'procurando_veterinario',
  tutor_id: 'tutor-1',
  veterinario_id: null,
  veterinario: null,
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  emits.length = 0;
  transicionar.mockResolvedValue({ id: 'atend-1', status: 'cancelado_admin' });
  prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
});

describe('Cancelar atendimento pela administração', () => {
  it('encerra como `cancelado_admin` e guarda o motivo', async () => {
    await admin.cancelarAtendimento(
      req({ body: { motivo: 'Sem veterinário disponível na região hoje' } }), res(), next
    );

    const chamada = transicionar.mock.calls[0][0];
    expect(chamada.para).toBe('cancelado_admin');
    expect(chamada.ator).toEqual({ id: 'admin-1', tipo: 'admin' });
    expect(chamada.dados.motivo_cancelamento).toBe('Sem veterinário disponível na região hoje');
  });

  it('avisa o tutor, que está preso sem poder abrir outro chamado', async () => {
    await admin.cancelarAtendimento(
      req({ body: { motivo: 'Sem cobertura na sua região' } }), res(), next
    );

    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('tutor-1', expect.objectContaining({
      title: 'Seu atendimento foi cancelado'
    }));
    expect(emits.some((e) => e.sala === 'user:tutor-1')).toBe(true);
  });

  it('avisa também o veterinário que já tinha aceitado', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(
      atendimento({ status: 'a_caminho', veterinario_id: 'vet-1', veterinario: { usuario_id: 'user-vet' } })
    );

    await admin.cancelarAtendimento(req({ body: { motivo: 'Duplicidade de chamado' } }), res(), next);

    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('user-vet', expect.anything());
  });

  it('exige motivo — é o texto que o tutor lê', async () => {
    await expect(admin.cancelarAtendimento(req({ body: { motivo: 'x' } }), res(), next))
      .rejects.toThrow(/motivo/i);
    expect(transicionar).not.toHaveBeenCalled();
  });

  it('não mexe em atendimento já encerrado', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento({ status: 'finalizado' }));

    await expect(admin.cancelarAtendimento(
      req({ body: { motivo: 'Motivo qualquer' } }), res(), next
    )).rejects.toThrow(/já está encerrado/i);
  });

  it('busca o atendimento no próprio tenant', async () => {
    await admin.cancelarAtendimento(req({ body: { motivo: 'Motivo suficiente' } }), res(), next);
    expect(prisma.solicitacao.findFirst.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
  });
});

describe('Reatribuir atendimento', () => {
  beforeEach(() => {
    transicionar.mockResolvedValue({ id: 'atend-1', status: 'procurando_veterinario' });
  });

  it('sem veterinário escolhido, devolve para a fila', async () => {
    await admin.reatribuirAtendimento(req({ body: {} }), res(), next);

    const chamada = transicionar.mock.calls[0][0];
    expect(chamada.para).toBe('procurando_veterinario');
    expect(chamada.dados.veterinario_id).toBeNull();
    expect(emits.some((e) => e.evento === 'solicitacao:nova')).toBe(true);
  });

  it('com veterinário escolhido, entrega o chamado a ele', async () => {
    prisma.veterinario.findFirst.mockResolvedValue({
      id: 'vet-2', usuario: { id: 'user-vet2', nome: 'Dr. João' }
    });
    transicionar.mockResolvedValue({ id: 'atend-1', status: 'veterinario_encontrado' });

    await admin.reatribuirAtendimento(req({ body: { veterinarioId: 'vet-2' } }), res(), next);

    expect(transicionar.mock.calls[0][0].para).toBe('veterinario_encontrado');
    expect(transicionar.mock.calls[0][0].dados.veterinario_id).toBe('vet-2');
    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('user-vet2', expect.anything());
  });

  it('só aceita veterinário credenciado', async () => {
    prisma.veterinario.findFirst.mockResolvedValue(null);

    await expect(admin.reatribuirAtendimento(
      req({ body: { veterinarioId: 'vet-fantasma' } }), res(), next
    )).rejects.toThrow(/não encontrado ou não credenciado/i);
  });

  it('avisa o veterinário anterior que o chamado saiu das mãos dele', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(
      atendimento({ status: 'veterinario_encontrado', veterinario_id: 'vet-1', veterinario: { usuario_id: 'user-vet1' } })
    );

    await admin.reatribuirAtendimento(req({ body: {} }), res(), next);

    expect(emits.some((e) => e.sala === 'user:user-vet1' && e.evento === 'atendimento:cancelado')).toBe(true);
  });

  it('não troca o profissional com o atendimento já em curso — aí é decisão clínica', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento({ status: 'atendimento_em_andamento' }));

    await expect(admin.reatribuirAtendimento(req({ body: {} }), res(), next))
      .rejects.toThrow(/já começou/i);
  });
});

describe('Veterinários para escolher na reatribuição', () => {
  it('lista só os credenciados do tenant, com os online primeiro', async () => {
    prisma.veterinario.findMany.mockResolvedValue([{ id: 'vet-1', online: true }]);

    await admin.listarVeterinariosCredenciados(req(), res(), next);

    const consulta = prisma.veterinario.findMany.mock.calls[0][0];
    expect(consulta.where).toEqual({
      tenant_id: 'tenant-1',
      aprovado_admin: true,
      status_credenciamento: 'APPROVED'
    });
    expect(consulta.orderBy).toEqual([{ online: 'desc' }]);
  });
});
