/**
 * Encaminhamento clínico com campos próprios.
 *
 * O que estes casos travam: motivo e orientação não voltam a ser enfiados em
 * `diagnostico`/`receita` com prefixo, e o desfecho continua exigindo um motivo
 * escrito — encaminhar sem dizer por quê é abandonar com etiqueta.
 */

jest.mock('../../../src/services/atendimento-state.service', () => ({
  transicionar: jest.fn(),
  atorDaRequest: jest.fn(() => ({ id: 'usuario-do-vet', tipo: 'veterinario' })),
  STATUS_ATIVOS: [],
  STATUS_FINALIZADOS: ['finalizado', 'concluido']
}));

const prisma = require('../../../src/config/database');
const { transicionar } = require('../../../src/services/atendimento-state.service');
const controller = require('../../../src/controllers/solicitacao.controller');

function requisicao(corpo: Record<string, unknown>) {
  return {
    params: { id: 'atend-1' },
    body: corpo,
    userId: 'usuario-do-vet',
    userType: 'veterinario',
    tenantId: 'tenant-1',
    app: { get: () => null }
  };
}

const resposta = () => {
  const res: Record<string, unknown> = {};
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

async function executar(req: unknown, res: unknown) {
  // `asyncHandler` repassa o erro ao next; aqui queremos a rejeição.
  return new Promise((resolve, reject) => {
    Promise.resolve(controller.encaminharEmergencia(req, res, reject)).then(resolve, reject);
  });
}

describe('Encaminhamento de emergência', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.veterinario.findFirst.mockResolvedValue({ id: 'vet-1' });
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', veterinario_id: 'vet-1', status: 'atendimento_em_andamento'
    });
    transicionar.mockResolvedValue({ id: 'atend-1', status: 'encaminhado', pet: { nome: 'Rex' }, tutor: {} });
  });

  it('grava motivo e orientação em campos próprios, não dentro do diagnóstico', async () => {
    await executar(
      requisicao({ motivo: 'Suspeita de torção gástrica', orientacao: 'Levar ao hospital 24h da avenida' }),
      resposta()
    );

    const chamada = transicionar.mock.calls[0][0];
    expect(chamada.para).toBe('encaminhado');
    expect(chamada.dados).toEqual(
      expect.objectContaining({
        encaminhamento_motivo: 'Suspeita de torção gástrica',
        encaminhamento_orientacao: 'Levar ao hospital 24h da avenida'
      })
    );
    expect(chamada.dados.diagnostico).toBeUndefined();
    expect(chamada.dados.receita).toBeUndefined();
  });

  it('sem orientação, o campo fica nulo em vez de guardar texto vazio', async () => {
    await executar(requisicao({ motivo: 'Precisa de radiografia agora' }), resposta());

    expect(transicionar.mock.calls[0][0].dados.encaminhamento_orientacao).toBeNull();
  });

  it('carimba a hora do encaminhamento', async () => {
    await executar(requisicao({ motivo: 'Quadro fora do alcance domiciliar' }), resposta());

    expect(transicionar.mock.calls[0][0].dados.encaminhado_em).toBeInstanceOf(Date);
  });

  it('exige motivo escrito — encaminhar sem dizer por quê não vale', async () => {
    await expect(
      executar(requisicao({ motivo: 'grave' }), resposta())
    ).rejects.toThrow(/motivo do encaminhamento/i);

    expect(transicionar).not.toHaveBeenCalled();
  });
});
