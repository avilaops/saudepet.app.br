/**
 * A busca que não terminava.
 *
 * Primeiro teste da casa em TypeScript. Cobre as duas metades do conserto: a
 * varredura que admite não haver veterinário, e o caminho de volta para quem
 * quiser tentar de novo.
 */

jest.mock('../../../src/services/atendimento-state.service', () => ({
  transicionar: jest.fn(),
  STATUS_ATIVOS: ['criado', 'procurando_veterinario', 'aceito', 'a_caminho']
}));

const prisma = require('../../../src/config/database');
const { transicionar } = require('../../../src/services/atendimento-state.service');
const servico = require('../../../src/services/busca-sem-resposta.service');

const MINUTO = 60 * 1000;

function chamadoDe(minutos: number, tipo: string | null = 'emergencia', id = 'sol-1') {
  return {
    id,
    tenant_id: 'tenant-1',
    tipo_atendimento: tipo,
    criado_em: new Date(Date.now() - minutos * MINUTO)
  };
}

describe('Busca sem resposta', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.findMany.mockResolvedValue([]);
    prisma.solicitacao.findFirst.mockResolvedValue(null);
    transicionar.mockResolvedValue({ id: 'sol-1', status: 'sem_veterinario' });
  });

  describe('quando desistir', () => {
    it('não desiste antes do prazo — um veterinário ainda pode aceitar', async () => {
      prisma.solicitacao.findMany.mockResolvedValue([chamadoDe(15)]);

      const resultado = await servico.encerrarBuscasSemResposta();

      expect(transicionar).not.toHaveBeenCalled();
      expect(resultado).toEqual({ verificados: 1, encerrados: 0 });
    });

    it('encerra a emergência aos 20 minutos, que é o dobro do alerta interno', async () => {
      prisma.solicitacao.findMany.mockResolvedValue([chamadoDe(21)]);

      const resultado = await servico.encerrarBuscasSemResposta();

      expect(transicionar).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'sol-1',
          para: 'sem_veterinario',
          origem: 'worker',
          // Se alguém aceitou entre a leitura e a escrita, a transição é
          // recusada e o atendimento segue — a corrida não pode matar o chamado.
          deveEstarEm: expect.arrayContaining(['procurando_veterinario'])
        })
      );
      expect(resultado.encerrados).toBe(1);
    });

    it('cada tipo tem o seu prazo, e o desconhecido cai no padrão', async () => {
      expect(servico.MINUTOS_ATE_DESISTIR.emergencia).toBe(20);
      expect(servico.MINUTOS_ATE_DESISTIR.teleorientacao).toBe(40);
      expect(servico.MINUTOS_ATE_DESISTIR.consulta_domiciliar).toBe(60);

      // Teleorientação com 30 minutos ainda não venceu; emergência com 30, sim.
      prisma.solicitacao.findMany.mockResolvedValue([
        chamadoDe(30, 'teleorientacao', 'tele'),
        chamadoDe(30, 'emergencia', 'emerg'),
        chamadoDe(30, 'tipo_que_nao_existe', 'outro')
      ]);

      await servico.encerrarBuscasSemResposta();

      const encerrados = transicionar.mock.calls.map((c: [{ id: string }]) => c[0].id);
      expect(encerrados).toEqual(['emerg']);
    });

    it('falha em um chamado não derruba o ciclo dos outros', async () => {
      prisma.solicitacao.findMany.mockResolvedValue([
        chamadoDe(30, 'emergencia', 'quebra'),
        chamadoDe(30, 'emergencia', 'segue')
      ]);
      transicionar
        .mockRejectedValueOnce(new Error('alguém aceitou primeiro'))
        .mockResolvedValueOnce({ id: 'segue' });

      const resultado = await servico.encerrarBuscasSemResposta();

      expect(resultado).toEqual({ verificados: 2, encerrados: 1 });
    });
  });

  describe('procurar de novo', () => {
    const pedido = { solicitacaoId: 'sol-1', tenantId: 'tenant-1', tutorId: 'tutor-1' };

    it('devolve o chamado à fila e avisa quem está de plantão', async () => {
      prisma.solicitacao.findFirst
        .mockResolvedValueOnce({ id: 'sol-1', status: 'sem_veterinario', tutor_id: 'tutor-1' })
        .mockResolvedValueOnce(null);
      transicionar.mockResolvedValue({ id: 'sol-1', status: 'procurando_veterinario' });

      const emit = jest.fn();
      const io = { to: jest.fn(() => ({ emit })) };

      await servico.retomarBusca({ ...pedido, io });

      expect(transicionar).toHaveBeenCalledWith(
        expect.objectContaining({ para: 'procurando_veterinario', deveEstarEm: ['sem_veterinario'] })
      );
      expect(io.to).toHaveBeenCalledWith('tenant:tenant-1:veterinarios');
      expect(emit).toHaveBeenCalledWith('solicitacao:nova', expect.anything());
    });

    it('não deixa retomar chamado de outra pessoa', async () => {
      prisma.solicitacao.findFirst.mockResolvedValueOnce({
        id: 'sol-1', status: 'sem_veterinario', tutor_id: 'outro-tutor'
      });

      await expect(servico.retomarBusca(pedido)).rejects.toThrow(/não é sua/i);
      expect(transicionar).not.toHaveBeenCalled();
    });

    it('não retoma busca que não foi encerrada', async () => {
      prisma.solicitacao.findFirst.mockResolvedValueOnce({
        id: 'sol-1', status: 'a_caminho', tutor_id: 'tutor-1'
      });

      await expect(servico.retomarBusca(pedido)).rejects.toThrow(/não está encerrada/i);
      expect(transicionar).not.toHaveBeenCalled();
    });

    it('respeita a regra de um atendimento ativo por tutor', async () => {
      prisma.solicitacao.findFirst
        .mockResolvedValueOnce({ id: 'sol-1', status: 'sem_veterinario', tutor_id: 'tutor-1' })
        .mockResolvedValueOnce({ id: 'sol-2' });

      await expect(servico.retomarBusca(pedido)).rejects.toThrow(/já possui um atendimento/i);
      expect(transicionar).not.toHaveBeenCalled();
    });

    it('funciona sem socket — a fila é o que importa, o aviso é cortesia', async () => {
      prisma.solicitacao.findFirst
        .mockResolvedValueOnce({ id: 'sol-1', status: 'sem_veterinario', tutor_id: 'tutor-1' })
        .mockResolvedValueOnce(null);

      await expect(servico.retomarBusca(pedido)).resolves.toBeDefined();
    });
  });
});
