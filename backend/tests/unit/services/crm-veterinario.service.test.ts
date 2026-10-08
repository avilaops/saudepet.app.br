const prisma = require('../../../src/config/database');
const crm = require('../../../src/services/crm-veterinario.service');

const TENANT = 'tenant-1';
const VET = 'vet-1';
const TUTOR = 'tutor-1';

describe('CRM do veterinário — clientela', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.clienteVeterinario.upsert.mockResolvedValue({ id: 'ficha-1' });
    prisma.clienteVeterinario.update.mockImplementation(({ data }) =>
      Promise.resolve({ id: 'ficha-1', ...data })
    );
    prisma.clienteVeterinario.count.mockResolvedValue(0);
    prisma.clienteVeterinario.findMany.mockResolvedValue([]);
  });

  describe('isolamento por veterinário', () => {
    it('a ficha é chaveada por (veterinario, tutor), não só por tutor', async () => {
      prisma.clienteVeterinario.findUnique.mockResolvedValue(null);

      await crm.obterCliente({ tenantId: TENANT, veterinarioId: VET, tutorId: TUTOR });

      const where = prisma.clienteVeterinario.findUnique.mock.calls[0][0].where;
      expect(where.veterinario_id_tutor_id).toEqual({
        veterinario_id: VET,
        tutor_id: TUTOR
      });
    });

    it('a listagem sempre filtra pelo veterinário logado', async () => {
      await crm.listarClientes({ tenantId: TENANT, veterinarioId: VET });

      const where = prisma.clienteVeterinario.findMany.mock.calls[0][0].where;
      expect(where.veterinario_id).toBe(VET);
      expect(where.tenant_id).toBe(TENANT);
    });

    it('não devolve ficha de outro tenant mesmo com o id certo', async () => {
      prisma.clienteVeterinario.findUnique.mockResolvedValue({
        id: 'ficha-1',
        tenant_id: 'outro-tenant',
        tutor: { id: TUTOR }
      });

      const ficha = await crm.obterCliente({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR
      });

      expect(ficha).toBeNull();
    });
  });

  describe('contadores', () => {
    it('recalcula a partir dos atendimentos reais, sem incrementar', async () => {
      prisma.solicitacao.aggregate.mockResolvedValue({
        _count: { _all: 7 },
        _max: { finalizado_em: new Date('2026-08-10T12:00:00Z') }
      });

      await crm.recalcularFicha({ tenantId: TENANT, veterinarioId: VET, tutorId: TUTOR });

      const data = prisma.clienteVeterinario.update.mock.calls[0][0].data;
      expect(data.total_atendimentos).toBe(7);
      expect(data.ultimo_atendimento).toEqual(new Date('2026-08-10T12:00:00Z'));
    });

    it('usa upsert para não quebrar em fechamentos simultâneos', async () => {
      prisma.solicitacao.aggregate.mockResolvedValue({
        _count: { _all: 1 },
        _max: { finalizado_em: null }
      });

      await crm.recalcularFicha({ tenantId: TENANT, veterinarioId: VET, tutorId: TUTOR });

      expect(prisma.clienteVeterinario.upsert).toHaveBeenCalled();
    });
  });

  describe('tags', () => {
    it('normaliza para não criar variações da mesma tag', async () => {
      await crm.atualizarFicha({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        dados: { tags: ['Idoso', 'idoso ', ' IDOSO', 'Agressivo'] }
      });

      const data = prisma.clienteVeterinario.update.mock.calls[0][0].data;
      expect(data.tags).toEqual(['Idoso', 'Agressivo']);
    });

    it('descarta tag vazia e limita a quantidade', async () => {
      await crm.atualizarFicha({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        dados: { tags: ['  ', '', ...Array.from({ length: 30 }, (_, i) => `tag${i}`)] }
      });

      const data = prisma.clienteVeterinario.update.mock.calls[0][0].data;
      expect(data.tags).toHaveLength(15);
      expect(data.tags).not.toContain('');
    });

    it('só grava os campos enviados', async () => {
      await crm.atualizarFicha({
        tenantId: TENANT,
        veterinarioId: VET,
        tutorId: TUTOR,
        dados: { favorito: true }
      });

      const data = prisma.clienteVeterinario.update.mock.calls[0][0].data;
      expect(data).toEqual({ favorito: true });
      expect(data).not.toHaveProperty('notas_privadas');
    });
  });

  describe('ordenação', () => {
    it('cliente sem atendimento não vai para o topo de "mais recentes"', async () => {
      await crm.listarClientes({ tenantId: TENANT, veterinarioId: VET, ordem: 'recentes' });

      const orderBy = prisma.clienteVeterinario.findMany.mock.calls[0][0].orderBy;
      expect(orderBy.ultimo_atendimento).toEqual({ sort: 'desc', nulls: 'last' });
    });
  });
});

export {};
