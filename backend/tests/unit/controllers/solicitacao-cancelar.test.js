const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/atendimento-state.service', () => {
  const real = jest.requireActual('../../../src/services/atendimento-state.service');
  return { ...real, transicionar: jest.fn().mockResolvedValue({ id: 'atend-1', status: 'cancelado_tutor' }) };
});
jest.mock('../../../src/services/push.service', () => ({ enviarParaUsuario: jest.fn() }));

const { transicionar } = require('../../../src/services/atendimento-state.service');
const controller = require('../../../src/controllers/solicitacao.controller');

const res = () => ({ json: jest.fn() });
const next = (erro) => { throw erro; };

function req(extra = {}) {
  return {
    params: { id: 'atend-1' },
    body: {},
    tenantId: 'tenant-1',
    userId: 'tutor-1',
    userType: 'tutor',
    app: { get: () => null },
    ...extra
  };
}

function atendimento(extra = {}) {
  return { id: 'atend-1', tutor_id: 'tutor-1', status: 'procurando_veterinario', veterinario: null, ...extra };
}

describe('Cancelamento do atendimento pelo tutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento());
  });

  it('cancela um chamado que ninguém aceitou', async () => {
    // Sem esta rota o tutor ficava travado: `create` recusa nova solicitação
    // enquanto houver uma ativa, e a tela chamava um endpoint inexistente.
    const resposta = res();
    await controller.cancelar(req({ body: { motivo: 'Consegui atendimento presencial' } }), resposta, next);

    const chamada = transicionar.mock.calls[0][0];
    expect(chamada.para).toBe('cancelado_tutor');
    expect(chamada.dados.motivo_cancelamento).toBe('Consegui atendimento presencial');
    expect(resposta.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('usa um motivo padrão quando o tutor não escreve nada', async () => {
    await controller.cancelar(req(), res(), next);
    expect(transicionar.mock.calls[0][0].dados.motivo_cancelamento).toBe('Cancelado pelo tutor');
  });

  it('recusa cancelar atendimento que já começou — encerrar ali é ato clínico', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(atendimento({ status: 'atendimento_em_andamento' }));

    await expect(controller.cancelar(req(), res(), next)).rejects.toThrow(/já começou/i);
    expect(transicionar).not.toHaveBeenCalled();
  });

  it('não deixa outro usuário cancelar o atendimento alheio', async () => {
    await expect(
      controller.cancelar(req({ userId: 'intruso' }), res(), next)
    ).rejects.toThrow(/só o tutor/i);
    expect(transicionar).not.toHaveBeenCalled();
  });

  it('atendimento de outro tenant não existe para quem pergunta', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    await expect(controller.cancelar(req(), res(), next)).rejects.toThrow(/não encontrada/i);
  });

  it('avisa o veterinário que já havia aceitado — ele pode estar a caminho', async () => {
    prisma.solicitacao.findFirst.mockResolvedValue(
      atendimento({ status: 'a_caminho', veterinario: { usuario_id: 'vet-usuario-1' } })
    );
    const pushService = require('../../../src/services/push.service');

    await controller.cancelar(req(), res(), next);

    expect(pushService.enviarParaUsuario).toHaveBeenCalledWith('vet-usuario-1', expect.objectContaining({
      title: expect.stringMatching(/cancelado/i)
    }));
  });
});
