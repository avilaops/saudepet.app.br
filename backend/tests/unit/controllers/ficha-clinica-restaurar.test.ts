/**
 * Desfazer uma remoção na ficha clínica.
 *
 * Remover sempre foi lógico — a linha fica, some das leituras, carrega quem
 * removeu e por quê. O que faltava era a volta: reativar um registro tirado por
 * engano exigia acesso ao banco.
 *
 * Isso importa mais do que parece: uma alergia removida por engano é uma
 * alergia que não aparece na hora de medicar.
 */

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn()
}));

const prisma = require('../../../src/config/database');
const AuditService = require('../../../src/services/audit.service');
const controller = require('../../../src/controllers/ficha-clinica.controller');

const resposta = () => {
  const res: Record<string, unknown> = {};
  res.json = jest.fn(() => res);
  res.status = jest.fn(() => res);
  return res;
};

const requisicao = (corpo: Record<string, unknown> = {}) => ({
  params: { petId: 'pet-1', id: 'reg-1' },
  body: { motivo: 'Removido por engano na pressa', ...corpo },
  userId: 'vet-usuario-1',
  userType: 'veterinario',
  user: { veterinario: { id: 'vet-1' } },
  tenantId: 'tenant-1'
});

const removido = {
  id: 'reg-1',
  pet_id: 'pet-1',
  ativo: false,
  removido_em: new Date(),
  removido_por: 'outro-vet',
  motivo_remocao: 'engano',
  alergia: 'Dipirona'
};

describe('Restaurar registro da ficha clínica', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Escopo v1.0: este veterinário atendeu o pet.
    prisma.solicitacao.findFirst.mockResolvedValue({ id: 'sol-1' });
    prisma.agendamento.findFirst.mockResolvedValue(null);
    prisma.petAlergia.findFirst.mockResolvedValue(removido);
    prisma.petAlergia.update.mockResolvedValue({ ...removido, ativo: true, removido_em: null });
    AuditService.logForensicEvent.mockResolvedValue(undefined);
  });

  it('procura entre os REMOVIDOS — é justamente o que sumiu das leituras', async () => {
    await controller.restaurarAlergia(requisicao(), resposta(), jest.fn());

    expect(prisma.petAlergia.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ativo: false }) })
    );
  });

  it('a marca da remoção sai junto — removido e ativo ao mesmo tempo seria mentira', async () => {
    await controller.restaurarAlergia(requisicao(), resposta(), jest.fn());

    const dados = prisma.petAlergia.update.mock.calls[0][0].data;
    expect(dados.ativo).toBe(true);
    expect(dados.removido_em).toBeNull();
    expect(dados.removido_por).toBeNull();
    expect(dados.motivo_remocao).toBeNull();
  });

  it('registra quem trouxe de volta', async () => {
    await controller.restaurarAlergia(requisicao(), resposta(), jest.fn());
    expect(prisma.petAlergia.update.mock.calls[0][0].data.atualizado_por).toBe('vet-usuario-1');
  });

  it('a volta também vira trilha — ninguém desfaz nada em silêncio numa ficha clínica', async () => {
    await controller.restaurarAlergia(requisicao(), resposta(), jest.fn());

    expect(AuditService.logForensicEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ficha_clinica.registro_restaurado',
        estadoAnterior: expect.anything(),
        estadoPosterior: expect.anything()
      })
    );
  });

  it('registro que não está removido não é restaurado', async () => {
    prisma.petAlergia.findFirst.mockResolvedValue(null);

    await expect(
      new Promise((resolve, reject) => {
        Promise.resolve(controller.restaurarAlergia(requisicao(), resposta(), reject)).then(resolve, reject);
      })
    ).rejects.toThrow(/não encontrada/i);

    expect(prisma.petAlergia.update).not.toHaveBeenCalled();
  });

  it('a ficha sabe listar o que foi removido, para a tela oferecer o desfazer', async () => {
    prisma.petAlergia.findMany.mockResolvedValue([removido]);
    prisma.petVacina.findMany.mockResolvedValue([]);
    prisma.petMedicamento.findMany.mockResolvedValue([]);

    const res = resposta();
    await controller.listarRemovidos(requisicao(), res, jest.fn());

    expect(prisma.petAlergia.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ ativo: false }) })
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ alergias: [removido], vacinas: [], medicamentos: [] })
    );
  });
});
