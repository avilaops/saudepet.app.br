/**
 * O tutor marcando consulta futura.
 *
 * A agenda existia inteira do lado do profissional e o tutor só podia confirmar
 * ou cancelar o que o veterinário criasse — para marcar um check-up, ele
 * precisava ligar.
 *
 * O que estes casos travam: emergência não se agenda, o pet tem que ser de quem
 * marca, e o compromisso nasce pendente — quem escolhe o horário é o tutor, mas
 * quem confirma que vai é o profissional.
 */

jest.mock('../../../src/services/agendamento.service', () => ({
  criar: jest.fn(),
  horariosLivres: jest.fn()
}));

const prisma = require('../../../src/config/database');
const agendamentoService = require('../../../src/services/agendamento.service');
const controller = require('../../../src/controllers/agendamento-do-tutor.controller');

const resposta = () => {
  const res: Record<string, unknown> = {};
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

const requisicao = (corpo: Record<string, unknown> = {}) => ({
  body: {
    veterinario_id: 'vet-1',
    pet_id: 'pet-1',
    inicio: '2026-09-10T14:00:00.000Z',
    tipo_atendimento: 'consulta_rotina',
    ...corpo
  },
  query: {},
  userId: 'tutor-1',
  tenantId: 'tenant-1'
});

/** `asyncHandler` repassa o erro ao next; aqui queremos a rejeição. */
const executar = (handler: Function, req: unknown, res: unknown) =>
  new Promise((resolve, reject) => {
    Promise.resolve(handler(req, res, reject)).then(resolve, reject);
  });

describe('Agendamento marcado pelo tutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1' });
    prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1', catalogo_itens: [{ codigo: 'consulta_rotina', preco: 160 }] });
    agendamentoService.criar.mockResolvedValue({ id: 'agend-1' });
    agendamentoService.horariosLivres.mockResolvedValue(['09:00', '09:30']);
  });

  it('marca a consulta com o profissional e o horário escolhidos', async () => {
    await executar(controller.marcar, requisicao(), resposta());

    expect(agendamentoService.criar).toHaveBeenCalledWith(
      expect.objectContaining({
        veterinarioId: 'vet-1',
        tutorId: 'tutor-1',
        petId: 'pet-1',
        tipoAtendimento: 'consulta_rotina',
        valorEstimado: 160,
        precoCatalogoCodigo: 'consulta_rotina'
      })
    );
  });

  it('nasce pendente — quem confirma que vai é o profissional', async () => {
    await executar(controller.marcar, requisicao(), resposta());

    expect(agendamentoService.criar.mock.calls[0][0].confirmadoDeCara).toBe(false);
  });

  it('emergência não se agenda: é pedido imediato, não compromisso', async () => {
    await expect(
      executar(controller.marcar, requisicao({ tipo_atendimento: 'emergencia' }), resposta())
    ).rejects.toThrow(/imediato/i);

    expect(agendamentoService.criar).not.toHaveBeenCalled();
  });

  it('teleorientação também não — ela acontece agora', async () => {
    await expect(
      executar(controller.marcar, requisicao({ tipo_atendimento: 'teleorientacao' }), resposta())
    ).rejects.toThrow(/imediato/i);
  });

  it('o pet precisa ser de quem está marcando', async () => {
    // Sem esta conferência, um id adivinhado marcaria consulta para o animal de
    // outra pessoa.
    prisma.pet.findFirst.mockResolvedValue(null);

    await expect(
      executar(controller.marcar, requisicao(), resposta())
    ).rejects.toThrow(/pet não encontrado/i);

    expect(agendamentoService.criar).not.toHaveBeenCalled();
  });

  it('profissional sem cadastro completo não recebe marcação', async () => {
    prisma.veterinario.findFirst.mockResolvedValue(null);

    await expect(
      executar(controller.marcar, requisicao(), resposta())
    ).rejects.toThrow(/não está disponível/i);
  });

  it('faltando profissional, pet ou horário, avisa antes de consultar o banco', async () => {
    await expect(
      executar(controller.marcar, requisicao({ inicio: undefined }), resposta())
    ).rejects.toThrow(/escolha o profissional/i);

    expect(prisma.pet.findFirst).not.toHaveBeenCalled();
  });

  it('lista os horários livres do dia pedido', async () => {
    const req = { ...requisicao(), query: { veterinario_id: 'vet-1', data: '2026-09-10' } };
    const res = resposta();

    await executar(controller.horarios, req, res);

    expect(agendamentoService.horariosLivres).toHaveBeenCalledWith(
      expect.objectContaining({ veterinarioId: 'vet-1', data: '2026-09-10' })
    );
    expect(res.json).toHaveBeenCalledWith({ horarios: ['09:00', '09:30'] });
  });

  it('sem dia ou sem profissional, não consulta a agenda', async () => {
    const req = { ...requisicao(), query: { veterinario_id: 'vet-1' } };

    await expect(executar(controller.horarios, req, resposta())).rejects.toThrow(/informe o profissional/i);
    expect(agendamentoService.horariosLivres).not.toHaveBeenCalled();
  });
});
