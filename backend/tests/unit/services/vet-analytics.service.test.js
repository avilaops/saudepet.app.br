const prisma = require('../../../src/config/database');
const analytics = require('../../../src/services/vet-analytics.service');

const TENANT = 'tenant-1';
const VET = 'vet-1';

describe('Números reais do veterinário', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resumo financeiro', () => {
    it('separa o que já caiu do que ainda está pendente', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([
        { recipient_amount: '100.00', status: 'PAID', criado_em: new Date() },
        { recipient_amount: '50.00', status: 'PENDING', criado_em: new Date() },
        { recipient_amount: '30.00', status: 'PAID', criado_em: new Date() }
      ]);

      const resumo = await analytics.resumoFinanceiro({ veterinarioId: VET });

      expect(resumo.total_recebido).toBe(130);
      expect(resumo.total_pendente).toBe(50);
    });

    it('não conta estorno como pendente', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([
        { recipient_amount: '100.00', status: 'PAID', criado_em: new Date() },
        { recipient_amount: '80.00', status: 'REFUNDED', criado_em: new Date() }
      ]);

      const resumo = await analytics.resumoFinanceiro({ veterinarioId: VET });

      expect(resumo.total_pendente).toBe(0);
      expect(resumo.total_recebido).toBe(100);
    });

    it('ticket médio é 0 (e não NaN) quando nada foi pago', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([
        { recipient_amount: '90.00', status: 'PENDING', criado_em: new Date() }
      ]);

      const resumo = await analytics.resumoFinanceiro({ veterinarioId: VET });

      expect(resumo.ticket_medio).toBe(0);
      expect(Number.isNaN(resumo.ticket_medio)).toBe(false);
    });

    it('só busca o que é do veterinário, como destinatário', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([]);

      await analytics.resumoFinanceiro({ veterinarioId: VET });

      const where = prisma.paymentSplit.findMany.mock.calls[0][0].where;
      expect(where.recipient_type).toBe('VETERINARIAN');
      expect(where.recipient_id).toBe(VET);
    });
  });

  describe('faturamento por mês', () => {
    it('gera os rótulos a partir de hoje, não fixos no código', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([]);

      const meses = await analytics.faturamentoPorMes({ veterinarioId: VET, meses: 6 });

      expect(meses).toHaveLength(6);

      const hoje = new Date();
      const esperadoUltimo = `${String(hoje.getMonth() + 1).padStart(2, '0')}/${String(hoje.getFullYear()).slice(2)}`;
      expect(meses[meses.length - 1].rotulo).toBe(esperadoUltimo);
    });

    it('mês sem receita entra com zero, sem sumir do gráfico', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([]);

      const meses = await analytics.faturamentoPorMes({ veterinarioId: VET, meses: 3 });

      expect(meses).toHaveLength(3);
      expect(meses.every((m) => m.valor === 0)).toBe(true);
    });

    it('soma os splits no mês correspondente', async () => {
      const hoje = new Date();
      prisma.paymentSplit.findMany.mockResolvedValue([
        { recipient_amount: '200.00', criado_em: hoje },
        { recipient_amount: '150.00', criado_em: hoje }
      ]);

      const meses = await analytics.faturamentoPorMes({ veterinarioId: VET, meses: 3 });
      const mesAtual = meses[meses.length - 1];

      expect(mesAtual.valor).toBe(350);
      expect(mesAtual.atendimentos).toBe(2);
    });

    it('considera apenas splits já pagos', async () => {
      prisma.paymentSplit.findMany.mockResolvedValue([]);

      await analytics.faturamentoPorMes({ veterinarioId: VET });

      const where = prisma.paymentSplit.findMany.mock.calls[0][0].where;
      expect(where.status).toBe('PAID');
    });
  });

  describe('distribuição de avaliações', () => {
    it('calcula média e percentual reais', async () => {
      prisma.avaliacao.groupBy.mockResolvedValue([
        { nota: 5, _count: { _all: 3 } },
        { nota: 4, _count: { _all: 1 } }
      ]);

      const r = await analytics.distribuicaoDeAvaliacoes({ tenantId: TENANT, veterinarioId: VET });

      expect(r.total).toBe(4);
      expect(r.media).toBe(4.75);
      expect(r.distribuicao.find((d) => d.nota === 5).percentual).toBe(75);
    });

    it('sem avaliação, a média é nula em vez de zero', async () => {
      prisma.avaliacao.groupBy.mockResolvedValue([]);

      const r = await analytics.distribuicaoDeAvaliacoes({ tenantId: TENANT, veterinarioId: VET });

      // Zero seria "nota mínima"; nulo é "ainda não avaliado".
      expect(r.media).toBeNull();
      expect(r.total).toBe(0);
    });
  });

  describe('atendimentos por tipo', () => {
    it('reflete o mix real, não uma barra fixa em 100%', async () => {
      prisma.solicitacao.groupBy.mockResolvedValue([
        { tipo_atendimento: 'consulta_domiciliar', _count: { _all: 3 } },
        { tipo_atendimento: 'teleorientacao', _count: { _all: 1 } }
      ]);

      const r = await analytics.atendimentosPorTipo({ tenantId: TENANT, veterinarioId: VET });

      expect(r.total).toBe(4);
      expect(r.tipos[0].tipo).toBe('consulta_domiciliar');
      expect(r.tipos[0].percentual).toBe(75);
      expect(r.tipos[1].percentual).toBe(25);
    });
  });

  describe('faturamento por cliente', () => {
    it('agrupa por tutor e junta o nome', async () => {
      prisma.payment.groupBy.mockResolvedValue([
        { tutor_id: 'tutor-1', _sum: { amount: '500.00' }, _count: { _all: 3 } }
      ]);
      prisma.usuario.findMany.mockResolvedValue([
        { id: 'tutor-1', nome: 'Maria', email: 'maria@exemplo.com' }
      ]);

      const r = await analytics.faturamentoPorCliente({ tenantId: TENANT, veterinarioId: VET });

      expect(r[0].tutor.nome).toBe('Maria');
      expect(r[0].total).toBe(500);
      expect(r[0].pagamentos).toBe(3);
    });

    it('não quebra quando o tutor foi removido', async () => {
      prisma.payment.groupBy.mockResolvedValue([
        { tutor_id: 'sumiu', _sum: { amount: '10.00' }, _count: { _all: 1 } }
      ]);
      prisma.usuario.findMany.mockResolvedValue([]);

      const r = await analytics.faturamentoPorCliente({ tenantId: TENANT, veterinarioId: VET });

      expect(r[0].tutor.nome).toBe('Cliente removido');
    });
  });
});
