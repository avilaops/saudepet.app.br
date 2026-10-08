// Estorno parcial e reprocessamento de webhook.
const prisma = require('../../../src/config/database');

const gateway = {
  refundPayment: jest.fn().mockResolvedValue({ refundId: 'ref-ext-1' })
};

const paymentService = require('../../../src/services/payment/payment.service');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(paymentService, 'getGateway').mockResolvedValue(gateway);
  prisma.refund.create.mockImplementation(({ data }) => Promise.resolve({ id: 'ref-1', ...data }));
  prisma.payment.update.mockResolvedValue({});
  prisma.paymentSplit.updateMany.mockResolvedValue({ count: 0 });
});

const pagamento = (extra = {}) => ({
  id: 'pay-1',
  tenant_id: 'tenant-1',
  provider: 'mercado_pago',
  external_payment_id: 'mp-1',
  amount: 150,
  status: 'PAID',
  refunds: [],
  ...extra
});

describe('Estorno parcial', () => {
  it('estorna o valor pedido, não o total', async () => {
    // A tela nunca mandava `amount`, então todo estorno era total — apesar de o
    // backend e o gateway suportarem parcial desde sempre.
    prisma.payment.findFirst.mockResolvedValue(pagamento());

    await paymentService.refundPayment({ paymentId: 'pay-1', amount: 50, reason: 'Serviço parcial', tenantId: 'tenant-1' });

    expect(gateway.refundPayment).toHaveBeenCalledWith('mp-1', 50, 'Serviço parcial');
    expect(prisma.refund.create.mock.calls[0][0].data.amount).toBe(50);
  });

  it('sem valor, estorna o que resta', async () => {
    prisma.payment.findFirst.mockResolvedValue(pagamento({ refunds: [{ amount: 50, status: 'COMPLETED' }] }));

    await paymentService.refundPayment({ paymentId: 'pay-1', reason: 'Restante', tenantId: 'tenant-1' });

    expect(prisma.refund.create.mock.calls[0][0].data.amount).toBe(100);
  });

  it('não devolve mais do que o tutor pagou', async () => {
    // Dois estornos parciais de 80% devolveriam 160% do valor pago.
    prisma.payment.findFirst.mockResolvedValue(pagamento({ refunds: [{ amount: 120, status: 'COMPLETED' }] }));

    await expect(paymentService.refundPayment({ paymentId: 'pay-1', amount: 120, reason: 'x', tenantId: 'tenant-1' }))
      .rejects.toThrow(/excede/i);
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it('recusa estornar de novo o que já foi devolvido por inteiro', async () => {
    prisma.payment.findFirst.mockResolvedValue(pagamento({ refunds: [{ amount: 150, status: 'COMPLETED' }] }));

    await expect(paymentService.refundPayment({ paymentId: 'pay-1', reason: 'x', tenantId: 'tenant-1' }))
      .rejects.toThrow(/totalmente estornado/i);
  });

  it('marca como estorno total quando a soma fecha o valor pago', async () => {
    prisma.payment.findFirst.mockResolvedValue(pagamento({ refunds: [{ amount: 100, status: 'COMPLETED' }] }));

    await paymentService.refundPayment({ paymentId: 'pay-1', amount: 50, reason: 'Fecha', tenantId: 'tenant-1' });

    expect(prisma.payment.update.mock.calls[0][0].data.status).toBe('REFUNDED');
  });

  it('ignora estorno que falhou na conta do que já foi devolvido', async () => {
    prisma.payment.findFirst.mockResolvedValue(pagamento({ refunds: [{ amount: 150, status: 'FAILED' }] }));

    await paymentService.refundPayment({ paymentId: 'pay-1', amount: 150, reason: 'Nova tentativa', tenantId: 'tenant-1' });

    expect(gateway.refundPayment).toHaveBeenCalled();
  });

  it('só encontra pagamento do próprio tenant', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    await expect(paymentService.refundPayment({ paymentId: 'pay-1', reason: 'x', tenantId: 'tenant-1' }))
      .rejects.toThrow(/não encontrado/i);
    expect(prisma.payment.findFirst.mock.calls[0][0].where.tenant_id).toBe('tenant-1');
  });

  it('recusa valor zero ou negativo', async () => {
    prisma.payment.findFirst.mockResolvedValue(pagamento());

    await expect(paymentService.refundPayment({ paymentId: 'pay-1', amount: 0, reason: 'x', tenantId: 'tenant-1' }))
      .rejects.toThrow(/maior que zero/i);
  });
});

export {};
