// Buracos da jornada que o mapa funcional (TELAS.md) encontrou.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/atendimento-state.service', () => {
  const real = jest.requireActual('../../../src/services/atendimento-state.service');
  return { ...real, transicionar: jest.fn().mockResolvedValue({ id: 'atend-1', status: 'cancelado_vet' }) };
});
jest.mock('../../../src/services/push.service', () => ({ enviarParaUsuario: jest.fn() }));
jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const { transicionar } = require('../../../src/services/atendimento-state.service');
const pushService = require('../../../src/services/push.service');
const solicitacaoController = require('../../../src/controllers/solicitacao.controller');
const adminAudit = require('../../../src/controllers/admin-audit.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  r.send = jest.fn().mockReturnValue(r);
  r.setHeader = jest.fn();
  return r;
};
const next = (erro) => { throw erro; };

const emits = [];
const io = { to: (sala) => ({ emit: (evento, dados) => emits.push({ sala, evento, dados }) }) };

const req = (extra = {}) => ({
  params: { id: 'atend-1' },
  body: {},
  query: {},
  tenantId: 'tenant-1',
  userId: 'user-vet',
  userType: 'veterinario',
  app: { get: () => io },
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  emits.length = 0;
});

describe('Veterinário desiste do atendimento (cancelado_vet)', () => {
  // `cancelado_vet` existia na máquina de estados e nenhuma tela o alcançava:
  // quem aceitasse e não pudesse ir deixava o chamado preso e o tutor esperando.
  beforeEach(() => {
    prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1' });
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', status: 'a_caminho', veterinario_id: 'vet-1', tutor_id: 'tutor-1'
    });
  });

  it('encerra o chamado e registra o motivo', async () => {
    await solicitacaoController.desistir(
      req({ body: { motivo: 'Meu carro quebrou no caminho' } }), res(), next
    );

    const chamada = transicionar.mock.calls[0][0];
    expect(chamada.para).toBe('cancelado_vet');
    expect(chamada.dados.motivo_cancelamento).toBe('Meu carro quebrou no caminho');
  });

  it('avisa o tutor, que está esperando alguém que não vem', async () => {
    await solicitacaoController.desistir(
      req({ body: { motivo: 'Tive um imprevisto' } }), res(), next
    );

    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('tutor-1', expect.objectContaining({
      title: 'O veterinário não poderá atender'
    }));
    expect(emits.some((e) => e.sala === 'user:tutor-1' && e.evento === 'atendimento:cancelado')).toBe(true);
  });

  it('exige motivo — o tutor precisa saber o que houve', async () => {
    await expect(solicitacaoController.desistir(req({ body: { motivo: 'não' } }), res(), next))
      .rejects.toThrow(/motivo/i);
    expect(transicionar).not.toHaveBeenCalled();
  });

  it('não deixa desistir de atendimento já em andamento — a saída é clínica', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', status: 'atendimento_em_andamento', veterinario_id: 'vet-1', tutor_id: 'tutor-1'
    });

    await expect(solicitacaoController.desistir(
      req({ body: { motivo: 'Não quero mais' } }), res(), next
    )).rejects.toThrow(/já começou/i);
  });

  it('não deixa desistir de chamado que é de outro veterinário', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', status: 'aceito', veterinario_id: 'vet-outro', tutor_id: 'tutor-1'
    });

    await expect(solicitacaoController.desistir(
      req({ body: { motivo: 'Motivo qualquer' } }), res(), next
    )).rejects.toThrow(/não encontrada/i);
  });
});

describe('Exportação da auditoria respeita o recorte da tela', () => {
  // A tela mandava só `format=json` e o backend só olhava as datas: saía sempre
  // o mesmo despejo dos 2 000 últimos registros do tenant.
  const reqAdmin = (query) => ({
    query,
    tenantId: 'tenant-1',
    isSuperAdmin: false,
    userId: 'admin-1',
    headers: {},
    ip: '127.0.0.1'
  });

  beforeEach(() => {
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'l1', criado_em: new Date('2026-08-20T10:00:00Z'), entity_type: 'payment', acao: 'estorno', action: null, ip: '1.2.3.4' }
    ]);
    prisma.auditLog.count.mockResolvedValue(1);
  });

  it('aplica tipo de entidade, ação e busca — não só as datas', async () => {
    await adminAudit.exportAuditLogs(
      reqAdmin({ tipoEvento: 'payment', action: 'estorno', search: '1.2.3.4' }), res(), next
    );

    const where = prisma.auditLog.findMany.mock.calls[0][0].where;
    expect(where.entity_type).toBe('payment');
    // A coluna é `acao` — filtrar por `action` fazia o Prisma recusar a consulta
    // inteira, e qualquer busca na central devolvia 500.
    expect(where.acao).toBe('estorno');
    expect(where.OR).toBeDefined();
    expect(where.OR.some((item) => 'action' in item)).toBe(false);
    expect(where.tenant_id).toBe('tenant-1');
  });

  it('diz no arquivo quando o teto cortou registros', async () => {
    // Um relatório truncado que não se anuncia lê-se como a coleção inteira.
    prisma.auditLog.count.mockResolvedValue(5000);

    const r = res();
    await adminAudit.exportAuditLogs(reqAdmin({}), r, next);

    const conteudo = JSON.parse(r.send.mock.calls[0][0]);
    expect(conteudo.truncado).toBe(true);
    expect(conteudo.registros_no_recorte).toBe(5000);
  });

  it('exporta CSV quando pedido — `format` era ignorado', async () => {
    const r = res();
    await adminAudit.exportAuditLogs(reqAdmin({ format: 'csv' }), r, next);

    expect(r.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv; charset=utf-8');
    expect(r.send.mock.calls[0][0]).toContain('entity_type');
  });
});

describe('Central de auditoria oferece só as entidades que existem', () => {
  it('devolve os `entity_type` realmente gravados, com contagem', async () => {
    // 4 das 6 opções escritas à mão na tela não casavam com nada e devolviam
    // lista vazia sempre.
    prisma.auditLog.findMany.mockResolvedValue([]);
    prisma.auditLog.count.mockResolvedValue(0);
    prisma.auditLog.groupBy.mockResolvedValue([
      { entity_type: 'payment', _count: { entity_type: 12 } },
      { entity_type: 'usuario', _count: { entity_type: 3 } }
    ]);

    const r = res();
    await adminAudit.getCentralAuditLogs(
      { query: {}, tenantId: 'tenant-1', isSuperAdmin: false, userId: 'admin-1', headers: {}, ip: '1.1.1.1' },
      r,
      next
    );

    expect(r.json.mock.calls[0][0].entidades).toEqual([
      { valor: 'payment', total: 12 },
      { valor: 'usuario', total: 3 }
    ]);
  });
});

export {};
