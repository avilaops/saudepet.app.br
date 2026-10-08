const prisma = require('../../../src/config/database');
const emailService = require('../../../src/services/email.service');
const worker = require('../../../src/services/agendamento-lembrete.worker');

function consultaAmanha(extra = {}) {
  return {
    id: 'ag-1',
    inicio: new Date(Date.now() + 20 * 3600000),
    tipo_atendimento: 'consulta_domiciliar',
    status: 'confirmado',
    lembrete_enviado: false,
    pet: { nome: 'Rex' },
    tutor: { nome: 'Maria', email: 'maria@exemplo.com' },
    veterinario: { usuario: { nome: 'João' } },
    ...extra
  };
}

describe('Worker de lembrete de consultas agendadas', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.agendamento.findMany.mockResolvedValue([]);
    prisma.agendamento.update.mockResolvedValue({});
  });

  it('busca só consultas futuras dentro da janela, ainda não avisadas e que ocupam agenda', async () => {
    await worker.processarLembretesDeConsulta();

    const where = prisma.agendamento.findMany.mock.calls[0][0].where;
    expect(where.lembrete_enviado).toBe(false);
    expect(where.status.in).toEqual(['pendente', 'confirmado']);

    const horas = (where.inicio.lte - where.inicio.gte) / 3600000;
    expect(horas).toBeCloseTo(worker.JANELA_HORAS, 1);
  });

  it('envia o lembrete ao tutor e marca lembrete_enviado', async () => {
    prisma.agendamento.findMany.mockResolvedValue([consultaAmanha()]);

    const { avisados } = await worker.processarLembretesDeConsulta();

    expect(avisados).toBe(1);
    expect(emailService.enviarEmailAgendamentoTutor).toHaveBeenCalledWith(
      'maria@exemplo.com',
      expect.objectContaining({ evento: 'lembrete', nomePet: 'Rex' })
    );
    expect(prisma.agendamento.update).toHaveBeenCalledWith({
      where: { id: 'ag-1' },
      data: { lembrete_enviado: true }
    });
  });

  it('tutor sem e-mail marca mesmo assim — não há para onde reenviar', async () => {
    prisma.agendamento.findMany.mockResolvedValue([
      consultaAmanha({ tutor: { nome: 'Maria', email: null } })
    ]);

    const { avisados } = await worker.processarLembretesDeConsulta();

    expect(avisados).toBe(0);
    expect(emailService.enviarEmailAgendamentoTutor).not.toHaveBeenCalled();
    expect(prisma.agendamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lembrete_enviado: true } })
    );
  });

  it('falha de envio NÃO marca lembrete_enviado: o próximo ciclo tenta de novo', async () => {
    prisma.agendamento.findMany.mockResolvedValue([consultaAmanha()]);
    emailService.enviarEmailAgendamentoTutor.mockRejectedValue(new Error('SMTP fora'));

    const { avisados } = await worker.processarLembretesDeConsulta();

    expect(avisados).toBe(0);
    expect(prisma.agendamento.update).not.toHaveBeenCalled();
  });

  it('uma consulta com erro não derruba as demais do lote', async () => {
    prisma.agendamento.findMany.mockResolvedValue([
      consultaAmanha({ id: 'ag-quebrada' }),
      consultaAmanha({ id: 'ag-2', tutor: { nome: 'Ana', email: 'ana@exemplo.com' } })
    ]);
    emailService.enviarEmailAgendamentoTutor
      .mockRejectedValueOnce(new Error('SMTP fora'))
      .mockResolvedValueOnce({ success: true });

    const { encontrados, avisados } = await worker.processarLembretesDeConsulta();

    expect(encontrados).toBe(2);
    expect(avisados).toBe(1);
    expect(prisma.agendamento.update).toHaveBeenCalledTimes(1);
    expect(prisma.agendamento.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'ag-2' } })
    );
  });
});

export {};
