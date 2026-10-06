// Fechamento de comissão dos parceiros.
//
// `CommissionSettlement` tinha modelo, listagem e rota de "marcar como pago", e
// NENHUM ponto do backend criava um: a aba "Liquidações & Repasses" era vazia
// por construção, e a rede de parceiros acumulava conversões sem nunca fechar o
// ciclo do dinheiro.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/audit.service', () => ({
  logForensicEvent: jest.fn().mockResolvedValue(undefined)
}));

const comissao = require('../../../src/controllers/commission.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const req = (extra = {}) => ({
  body: {},
  params: {},
  query: {},
  headers: {},
  ip: '1.1.1.1',
  user: { id: 'admin-1', tenant_id: 'tenant-1' },
  ...extra
});

const conversao = (id, partnerId, valores) => ({
  id,
  grossAmount: valores.gross,
  commissionAmount: valores.comissao,
  partnerNetAmount: valores.liquido,
  referral: { partnerId }
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.$transaction.mockImplementation((arg) =>
    typeof arg === 'function' ? arg(prisma) : Promise.all(arg));
  prisma.commissionSettlement.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: `set-${data.partnerId}`, ...data, partner: { tradeName: 'Clínica X' } }));
  prisma.referralConversion.updateMany.mockResolvedValue({ count: 1 });
});

describe('Gerar fechamentos do período', () => {
  it('agrupa por parceiro e soma bruto, comissão e líquido', async () => {
    prisma.referralConversion.findMany.mockResolvedValue([
      conversao('c1', 'p1', { gross: 100, comissao: 10, liquido: 90 }),
      conversao('c2', 'p1', { gross: 250.55, comissao: 25.06, liquido: 225.49 }),
      conversao('c3', 'p2', { gross: 80, comissao: 8, liquido: 72 })
    ]);

    const r = res();
    await comissao.generateSettlements(
      req({ body: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } }), r, next
    );

    const criados = prisma.commissionSettlement.create.mock.calls.map((c) => c[0].data);
    expect(criados).toHaveLength(2);

    const p1 = criados.find((item) => item.partnerId === 'p1');
    expect(p1.grossAmount).toBeCloseTo(350.55, 2);
    expect(p1.commissionAmount).toBeCloseTo(35.06, 2);
    expect(p1.netAmount).toBeCloseTo(315.49, 2);
    expect(p1.tenantId).toBe('tenant-1');
    expect(p1.status).toBe('OPEN');
  });

  it('carimba as conversões — rodar de novo não pode cobrar duas vezes', async () => {
    prisma.referralConversion.findMany.mockResolvedValue([
      conversao('c1', 'p1', { gross: 100, comissao: 10, liquido: 90 })
    ]);

    await comissao.generateSettlements(
      req({ body: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } }), res(), next
    );

    expect(prisma.referralConversion.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['c1'] } },
      data: { settlementId: 'set-p1' }
    });
  });

  it('busca só conversão confirmada e ainda não fechada, do próprio tenant', async () => {
    prisma.referralConversion.findMany.mockResolvedValue([]);

    await comissao.generateSettlements(
      req({ body: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } }), res(), next
    );

    const where = prisma.referralConversion.findMany.mock.calls[0][0].where;
    expect(where.status).toBe('CONFIRMED');
    expect(where.settlementId).toBeNull();
    expect(where.referral.tenantId).toBe('tenant-1');
  });

  it('inclui o último dia inteiro do período', async () => {
    // "até 31/08" tem que pegar o atendimento das 18h do dia 31.
    prisma.referralConversion.findMany.mockResolvedValue([]);

    await comissao.generateSettlements(
      req({ body: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } }), res(), next
    );

    const { lte } = prisma.referralConversion.findMany.mock.calls[0][0].where.confirmedAt;
    expect(lte.getHours()).toBe(23);
    expect(lte.getMinutes()).toBe(59);
  });

  it('não cria nada quando não há conversão em aberto', async () => {
    prisma.referralConversion.findMany.mockResolvedValue([]);

    const r = res();
    await comissao.generateSettlements(
      req({ body: { periodStart: '2026-07-01', periodEnd: '2026-07-31' } }), r, next
    );

    expect(prisma.commissionSettlement.create).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].message).toMatch(/nenhuma conversão/i);
  });

  it('recusa período invertido', async () => {
    await expect(comissao.generateSettlements(
      req({ body: { periodStart: '2026-08-31', periodEnd: '2026-08-01' } }), res(), next
    )).rejects.toThrow(/não pode ser depois/i);
  });

  it('exige o período', async () => {
    await expect(comissao.generateSettlements(req({ body: {} }), res(), next))
      .rejects.toThrow(/período/i);
  });
});

describe('Quitar fechamento', () => {
  const reqPagar = req({ params: { id: 'set-1' }, body: { paymentReference: 'PIX E99' } });

  it('só encontra fechamento do próprio tenant', async () => {
    prisma.commissionSettlement.findFirst.mockResolvedValue(null);

    await expect(comissao.markSettlementPaid(reqPagar, res(), next)).rejects.toThrow(/não encontrado/i);
    expect(prisma.commissionSettlement.findFirst.mock.calls[0][0].where.tenantId).toBe('tenant-1');
  });

  it('registra a baixa com referência do pagamento', async () => {
    prisma.commissionSettlement.findFirst.mockResolvedValue({ id: 'set-1', status: 'OPEN', partnerId: 'p1', commissionAmount: 35 });
    prisma.commissionSettlement.update.mockResolvedValue({ id: 'set-1', status: 'PAID', paidAt: new Date(), paymentReference: 'PIX E99', commissionAmount: 35 });

    await comissao.markSettlementPaid(reqPagar, res(), next);

    const dados = prisma.commissionSettlement.update.mock.calls[0][0].data;
    expect(dados.status).toBe('PAID');
    expect(dados.paymentReference).toBe('PIX E99');
  });

  it('recusa quitar duas vezes', async () => {
    prisma.commissionSettlement.findFirst.mockResolvedValue({ id: 'set-1', status: 'PAID' });

    await expect(comissao.markSettlementPaid(reqPagar, res(), next)).rejects.toThrow(/já está quitado/i);
  });
});

describe('Cancelar fechamento', () => {
  const reqCancelar = req({ params: { id: 'set-1' }, body: { motivo: 'Valores conferidos errado' } });

  it('devolve as conversões para a fila', async () => {
    // Sem soltar as conversões elas ficariam presas a um fechamento morto e
    // nunca mais seriam cobradas.
    prisma.commissionSettlement.findFirst.mockResolvedValue({ id: 'set-1', status: 'OPEN' });
    prisma.commissionSettlement.update.mockResolvedValue({ id: 'set-1', status: 'CANCELLED' });
    prisma.referralConversion.updateMany.mockResolvedValue({ count: 3 });

    await comissao.cancelSettlement(reqCancelar, res(), next);

    expect(prisma.referralConversion.updateMany).toHaveBeenCalledWith({
      where: { settlementId: 'set-1' },
      data: { settlementId: null }
    });
  });

  it('não cancela fechamento já quitado', async () => {
    prisma.commissionSettlement.findFirst.mockResolvedValue({ id: 'set-1', status: 'PAID' });

    await expect(comissao.cancelSettlement(reqCancelar, res(), next)).rejects.toThrow(/já quitado/i);
  });

  it('exige motivo', async () => {
    await expect(comissao.cancelSettlement(
      req({ params: { id: 'set-1' }, body: { motivo: 'x' } }), res(), next
    )).rejects.toThrow(/motivo/i);
  });
});

describe('Listar fechamentos', () => {
  it('filtra por tenant e soma o que ainda há a receber', async () => {
    prisma.commissionSettlement.findMany.mockResolvedValue([
      { id: 's1', status: 'OPEN', grossAmount: 350, commissionAmount: 35, netAmount: 315, _count: { conversions: 2 } },
      { id: 's2', status: 'PAID', grossAmount: 80, commissionAmount: 8, netAmount: 72, _count: { conversions: 1 } }
    ]);

    const r = res();
    await comissao.listSettlements(req(), r, next);

    expect(prisma.commissionSettlement.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-1');
    expect(r.json.mock.calls[0][0].total_a_receber).toBe(35);
    expect(r.json.mock.calls[0][0].settlements[0].atendimentos).toBe(2);
  });
});
