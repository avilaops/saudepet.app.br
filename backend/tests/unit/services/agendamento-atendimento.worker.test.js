const prisma = require('../../../src/config/database');
const worker = require('../../../src/services/agendamento-atendimento.worker');

describe('Worker agenda → atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.agendamento.findMany.mockResolvedValue([]);
    prisma.agendamento.findFirst.mockResolvedValue(null);
    prisma.agendamento.update.mockResolvedValue({});
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    prisma.solicitacao.create.mockResolvedValue({ id: 'sol-1', pet: {}, tutor: {} });
    prisma.solicitacaoTimeline.create.mockResolvedValue({});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  it('procura só consultas confirmadas, ainda sem atendimento, na janela da hora marcada', async () => {
    await worker.processarAgendamentosDoMomento();

    const where = prisma.agendamento.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(['confirmado']);
    // A consulta que já virou atendimento não pode ser varrida de novo.
    expect(where.solicitacao_id).toBeNull();

    const minutos = (where.inicio.lte - where.inicio.gte) / 60000;
    expect(minutos).toBeCloseTo(worker.ANTECEDENCIA_MIN + worker.TOLERANCIA_ATRASO_MIN, 0);
  });

  it('abre o atendimento de cada consulta encontrada', async () => {
    prisma.agendamento.findMany.mockResolvedValue([{ id: 'ag-1', tenant_id: 'tenant-1' }]);
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 'ag-1',
      tenant_id: 'tenant-1',
      tutor_id: 'tutor-1',
      pet_id: 'pet-1',
      veterinario_id: 'vet-1',
      tipo_atendimento: 'consulta_domiciliar',
      status: 'confirmado',
      solicitacao_id: null,
      inicio: new Date(),
      pet: { nome: 'Rex' },
      tutor: { id: 'tutor-1', cidade: 'SP' },
      veterinario: { id: 'vet-1' }
    });

    const { encontrados, abertos } = await worker.processarAgendamentosDoMomento();

    expect(encontrados).toBe(1);
    expect(abertos).toBe(1);
    expect(prisma.solicitacao.create).toHaveBeenCalled();
  });

  it('adia sem quebrar o ciclo quando o tutor já tem atendimento em andamento', async () => {
    prisma.agendamento.findMany.mockResolvedValue([
      { id: 'ag-1', tenant_id: 'tenant-1' },
      { id: 'ag-2', tenant_id: 'tenant-1' }
    ]);
    prisma.agendamento.findFirst.mockResolvedValue({
      id: 'ag-1',
      tenant_id: 'tenant-1',
      tutor_id: 'tutor-1',
      pet_id: 'pet-1',
      veterinario_id: 'vet-1',
      tipo_atendimento: 'consulta_domiciliar',
      status: 'confirmado',
      solicitacao_id: null,
      inicio: new Date(),
      pet: {},
      tutor: {},
      veterinario: {}
    });
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-aberta' });

    const { abertos, ignorados } = await worker.processarAgendamentosDoMomento();

    expect(abertos).toBe(0);
    expect(ignorados).toBe(2);
    expect(prisma.solicitacao.create).not.toHaveBeenCalled();
  });
});
