// Dois e-mails de alerta que existiam prontos, com template completo, e que
// NENHUM arquivo do backend chamava: SLA de chamado sem aceite e avaliação
// ruim. Na prática, um chamado de emergência abandonado só era descoberto por
// reclamação do tutor, e uma nota 1 só se alguém abrisse a tela de avaliações.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/email.service', () => ({
  enviarEmailAlertaSlaAdmin: jest.fn().mockResolvedValue(undefined),
  enviarEmailAlertaNpsRuimAdmin: jest.fn().mockResolvedValue(undefined),
  sendMail: jest.fn().mockResolvedValue(undefined)
}));

const emailService = require('../../../src/services/email.service');
const { verificarSla, MARCA_ALERTA } = require('../../../src/services/sla-atendimento.worker');
const avaliacaoController = require('../../../src/controllers/avaliacao.controller');

const minutosAtras = (minutos) => new Date(Date.now() - minutos * 60 * 1000);

const chamado = (extra = {}) => ({
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  tenant_id: 'tenant-1',
  tipo_atendimento: 'emergencia',
  criado_em: minutosAtras(15),
  observacoes: null,
  localizacao_cliente: 'Vila Mariana, São Paulo',
  tutor: { nome: 'Maria', cidade: 'São Paulo' },
  ...extra
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.usuario.findMany.mockResolvedValue([{ email: 'admin@saudepet.app.br' }]);
  prisma.solicitacao.update.mockResolvedValue({});
});

describe('Vigia de SLA', () => {
  it('alerta a equipe sobre emergência sem aceite além do prazo', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([chamado()]);

    const resultado = await verificarSla();

    expect(emailService.enviarEmailAlertaSlaAdmin).toHaveBeenCalledWith(
      'admin@saudepet.app.br',
      expect.objectContaining({ bairroCidade: 'Vila Mariana, São Paulo', tempoDecorrido: '15 minutos' })
    );
    expect(resultado.alertados).toBe(1);
  });

  it('respeita prazo maior para consulta agendada', async () => {
    // Emergência tem 10 min; consulta domiciliar, 30. Aos 15 minutos só a
    // emergência é caso de alerta.
    prisma.solicitacao.findMany.mockResolvedValue([
      chamado({ tipo_atendimento: 'consulta_domiciliar', criado_em: minutosAtras(15) })
    ]);

    const resultado = await verificarSla();

    expect(emailService.enviarEmailAlertaSlaAdmin).not.toHaveBeenCalled();
    expect(resultado.alertados).toBe(0);
  });

  it('não repete o alerta do mesmo chamado a cada ciclo', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([
      chamado({ observacoes: `Dor abdominal ${MARCA_ALERTA}` })
    ]);

    await verificarSla();

    expect(emailService.enviarEmailAlertaSlaAdmin).not.toHaveBeenCalled();
  });

  it('carimba o chamado para o ciclo seguinte não reprocessar', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([chamado({ observacoes: 'Dor abdominal' })]);

    await verificarSla();

    const dados = prisma.solicitacao.update.mock.calls[0][0].data;
    expect(dados.observacoes).toContain(MARCA_ALERTA);
    expect(dados.observacoes).toContain('Dor abdominal');
  });

  it('carimba mesmo sem admin cadastrado, para não girar em falso', async () => {
    prisma.usuario.findMany.mockResolvedValue([]);
    prisma.solicitacao.findMany.mockResolvedValue([chamado()]);

    await verificarSla();

    expect(emailService.enviarEmailAlertaSlaAdmin).not.toHaveBeenCalled();
    expect(prisma.solicitacao.update).toHaveBeenCalled();
  });

  it('uma falha não interrompe os outros chamados do ciclo', async () => {
    prisma.solicitacao.findMany.mockResolvedValue([
      chamado({ id: 'chamado-1' }),
      chamado({ id: 'chamado-2' })
    ]);
    emailService.enviarEmailAlertaSlaAdmin.mockRejectedValueOnce(new Error('SMTP fora'));

    const resultado = await verificarSla();

    expect(emailService.enviarEmailAlertaSlaAdmin).toHaveBeenCalledTimes(2);
    expect(resultado.alertados).toBe(1);
  });
});

describe('Avaliação do atendimento', () => {
  const res = () => {
    const r = {};
    r.json = jest.fn().mockReturnValue(r);
    r.status = jest.fn().mockReturnValue(r);
    return r;
  };
  const next = (erro) => { throw erro; };

  const req = (body) => ({
    body,
    params: {},
    tenantId: 'tenant-1',
    userId: 'tutor-1',
    user: { id: 'tutor-1', tenant_id: 'tenant-1' }
  });

  beforeEach(() => {
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', tenant_id: 'tenant-1', tutor_id: 'tutor-1',
      veterinario_id: 'vet-1', status: 'finalizado'
    });
    prisma.avaliacao.findUnique.mockResolvedValue(null);
    prisma.avaliacao.findFirst.mockResolvedValue(null);
    prisma.avaliacao.create.mockImplementation(({ data }) => Promise.resolve({ id: 'av-1', ...data }));
    prisma.avaliacao.findMany.mockResolvedValue([{ nota: 5 }, { nota: 1 }]);
    prisma.veterinario.update.mockResolvedValue({});
    prisma.veterinario.findUnique.mockResolvedValue({ usuario: { nome: 'Dra. Ana' } });
    prisma.usuario.findUnique.mockResolvedValue({ nome: 'Maria' });
  });

  it('não conta a avaliação como se fosse um atendimento a mais', async () => {
    // `total_atendimentos: { increment: 1 }` estava aqui: como só parte dos
    // tutores avalia, o contador exibido no perfil do vet não era nem o total de
    // atendimentos nem o de avaliações.
    await avaliacaoController.criar(req({ atendimentoId: 'atend-1', nota: 5 }), res(), next);

    const dados = prisma.veterinario.update.mock.calls[0][0].data;
    expect(dados.total_atendimentos).toBeUndefined();
    expect(dados.avaliacao_media).toBe(3);
  });

  it('avisa a equipe quando a nota é 1 ou 2', async () => {
    await avaliacaoController.criar(req({ atendimentoId: 'atend-1', nota: 1, comentario: 'Não veio' }), res(), next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(emailService.enviarEmailAlertaNpsRuimAdmin).toHaveBeenCalledWith(
      'admin@saudepet.app.br',
      expect.objectContaining({ nota: 1, comentario: 'Não veio', nomeTutor: 'Maria' })
    );
  });

  it('não avisa quando a nota é boa', async () => {
    await avaliacaoController.criar(req({ atendimentoId: 'atend-1', nota: 4 }), res(), next);
    await new Promise((resolve) => setImmediate(resolve));

    expect(emailService.enviarEmailAlertaNpsRuimAdmin).not.toHaveBeenCalled();
  });
});

export {};
