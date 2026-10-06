const prisma = require('../../../src/config/database');
const {
  TRANSICOES,
  STATUS_ATIVOS,
  podeTransicionar,
  transicionar
} = require('../../../src/services/atendimento-state.service');

const TENANT = 'tenant-1';
const ID = 'sol-1';

function mockAtendimento(status) {
  prisma.solicitacao.findFirst.mockResolvedValue({ id: ID, status, tenant_id: TENANT });
}

describe('Máquina de estados do atendimento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.solicitacao.updateMany.mockResolvedValue({ count: 1 });
    prisma.solicitacaoTimeline.create.mockResolvedValue({});
    prisma.$transaction.mockImplementation((callback) => callback(prisma));
  });

  describe('mapa de transições', () => {
    it('cobre todos os status ativos', () => {
      STATUS_ATIVOS.forEach((status) => {
        expect(TRANSICOES[status]).toBeDefined();
      });
    });

    it('permite o caminho feliz completo do chamado', () => {
      expect(podeTransicionar('criado', 'procurando_veterinario')).toBe(true);
      expect(podeTransicionar('procurando_veterinario', 'veterinario_encontrado')).toBe(true);
      expect(podeTransicionar('veterinario_encontrado', 'a_caminho')).toBe(true);
      expect(podeTransicionar('a_caminho', 'chegou')).toBe(true);
      expect(podeTransicionar('chegou', 'atendimento_em_andamento')).toBe(true);
      expect(podeTransicionar('atendimento_em_andamento', 'finalizado')).toBe(true);
    });

    it('não deixa pular o deslocamento e a chegada', () => {
      expect(podeTransicionar('veterinario_encontrado', 'atendimento_em_andamento')).toBe(false);
      expect(podeTransicionar('a_caminho', 'atendimento_em_andamento')).toBe(false);
      expect(podeTransicionar('procurando_veterinario', 'finalizado')).toBe(false);
    });

    it('trata o atendimento finalizado como imutável, exceto por contestação', () => {
      expect(TRANSICOES.finalizado).toEqual(['contestado']);
      expect(podeTransicionar('finalizado', 'atendimento_em_andamento')).toBe(false);
      expect(podeTransicionar('cancelado', 'procurando_veterinario')).toBe(false);
    });

    it('devolve o chamado para a fila quando o veterinário recusa', () => {
      expect(podeTransicionar('veterinario_encontrado', 'procurando_veterinario')).toBe(true);
    });
  });

  describe('transicionar', () => {
    it('grava a linha do tempo com ator, origem e status anterior', async () => {
      mockAtendimento('a_caminho');

      await transicionar({
        id: ID,
        tenantId: TENANT,
        para: 'chegou',
        ator: { id: 'user-vet', tipo: 'veterinario' },
        observacao: 'Chegou ao endereço'
      });

      expect(prisma.solicitacaoTimeline.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT,
          atendimento_id: ID,
          status: 'chegou',
          status_anterior: 'a_caminho',
          ator_id: 'user-vet',
          ator_tipo: 'veterinario',
          origem: 'api',
          observacao: 'Chegou ao endereço'
        })
      });
    });

    it('marca como sistema a mudança sem ator identificado', async () => {
      mockAtendimento('oferta_enviada');

      await transicionar({
        id: ID,
        tenantId: TENANT,
        para: 'procurando_veterinario',
        origem: 'worker'
      });

      expect(prisma.solicitacaoTimeline.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ator_id: null, ator_tipo: 'sistema', origem: 'worker' })
      });
    });

    it('recusa transição que pula etapa e não escreve nada', async () => {
      mockAtendimento('veterinario_encontrado');

      await expect(
        transicionar({ id: ID, tenantId: TENANT, para: 'atendimento_em_andamento' })
      ).rejects.toThrow(/Transição de status inválida/);

      expect(prisma.solicitacao.updateMany).not.toHaveBeenCalled();
      expect(prisma.solicitacaoTimeline.create).not.toHaveBeenCalled();
    });

    it('respeita a restrição extra de status de origem do endpoint', async () => {
      mockAtendimento('procurando_veterinario');

      await expect(
        transicionar({
          id: ID,
          tenantId: TENANT,
          para: 'veterinario_encontrado',
          deveEstarEm: ['oferta_enviada']
        })
      ).rejects.toThrow(/não pode ir para/);

      expect(prisma.solicitacao.updateMany).not.toHaveBeenCalled();
    });

    it('atualiza sob guarda do status lido, para não sobrescrever quem chegou antes', async () => {
      mockAtendimento('procurando_veterinario');

      await transicionar({
        id: ID,
        tenantId: TENANT,
        para: 'veterinario_encontrado',
        dados: { veterinario_id: 'vet-1' }
      });

      expect(prisma.solicitacao.updateMany).toHaveBeenCalledWith({
        where: { id: ID, tenant_id: TENANT, status: 'procurando_veterinario' },
        data: { veterinario_id: 'vet-1', status: 'veterinario_encontrado' }
      });
    });

    it('falha quando outro ator mudou o status no meio da operação', async () => {
      mockAtendimento('procurando_veterinario');
      prisma.solicitacao.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        transicionar({ id: ID, tenantId: TENANT, para: 'veterinario_encontrado' })
      ).rejects.toThrow(/mudou de status durante a operação/);

      expect(prisma.solicitacaoTimeline.create).not.toHaveBeenCalled();
    });

    it('não vaza atendimento de outro tenant', async () => {
      prisma.solicitacao.findFirst.mockResolvedValue(null);

      await expect(
        transicionar({ id: ID, tenantId: 'tenant-2', para: 'chegou' })
      ).rejects.toThrow(/não encontrada/);
    });
  });
});
