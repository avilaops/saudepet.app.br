/**
 * A rede embaixo do webhook.
 *
 * Em 27/08/2026 um pagamento REAL de R$ 0,10 foi aprovado no Mercado Pago e
 * ficou `PENDING` no nosso banco. Não havia bug no fluxo de pagamento: o
 * webhook chegava e era recusado na assinatura, então a notificação
 * simplesmente nunca virava um `UPDATE`. Do lado de fora isso é indistinguível
 * de "o cliente não pagou" — ele viu o dinheiro sair e o sistema jurava que não.
 *
 * Estes testes travam a regra que impede a repetição: "pago" não pode depender
 * de uma notificação ter chegado. E travam, principalmente, as três formas de
 * a rede de segurança se tornar ela mesma uma fonte de mentira — reprocessar,
 * gravar hora errada, ou gravar status errado.
 */

const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/payment/payment.service', () => ({
  getGateway: jest.fn(),
  processWebhookEvent: jest.fn()
}));

const paymentService = require('../../../src/services/payment/payment.service');
const { reconciliarPagamentos } = require('../../../src/services/payment/reconciliacao.worker');

const AGORA = new Date('2026-08-27T15:00:00.000Z');
const APROVADO_EM = new Date('2026-08-27T11:32:00.000Z');

function cobranca(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'pay-local-1',
    tenant_id: 'tenant-1',
    provider: 'mercado_pago',
    external_payment_id: '123456789',
    status: 'PENDING',
    ...sobrescreve
  };
}

/** O que o Mercado Pago responde em `/v1/payments/:id`. */
function respostaDoGateway(sobrescreve: Record<string, unknown> = {}) {
  return {
    externalPaymentId: '123456789',
    status: 'PAID',
    statusOriginal: 'approved',
    externalReference: 'ref-1',
    paidAt: APROVADO_EM,
    ...sobrescreve
  };
}

function comGateway(getPaymentStatus: jest.Mock) {
  paymentService.getGateway.mockResolvedValue({ getPaymentStatus });
}

describe('Reconciliação de pagamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    paymentService.processWebhookEvent.mockResolvedValue({ status: 'PROCESSED' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('o caso que motivou tudo: aprovado no gateway, PENDING aqui — e fecha', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway()));

    const resultado = await reconciliarPagamentos(AGORA);

    expect(resultado).toMatchObject({ conferidas: 1, divergentes: 1, fechadas: 1, erros: 0 });
    expect(paymentService.processWebhookEvent).toHaveBeenCalledTimes(1);
  });

  it('entrega o status BRUTO do provedor, não o já traduzido', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway()));

    await reconciliarPagamentos(AGORA);

    // `mapStatus` traduz 'approved' → 'PAID' e devolve 'PENDING' para tudo que
    // não reconhece. Mandar 'PAID' faria o pagamento voltar a PENDING — e a
    // reconciliação ainda contaria como resolvido. Silencioso e errado.
    const { paymentData } = paymentService.processWebhookEvent.mock.calls[0][0];
    expect(paymentData.status).toBe('approved');
  });

  it('grava a hora da APROVAÇÃO, não a da varredura', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway()));

    await reconciliarPagamentos(AGORA);

    // O pagamento entrou às 11:32 e só foi descoberto às 15:00. Carimbar 15:00
    // jogaria a receita para o dia/mês errado no extrato do veterinário.
    const { paidAt } = paymentService.processWebhookEvent.mock.calls[0][0];
    expect(paidAt).toEqual(APROVADO_EM);
  });

  it('o mesmo desencontro gera sempre o mesmo id de evento — rodar duas vezes não paga duas vezes', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway()));

    await reconciliarPagamentos(AGORA);
    await reconciliarPagamentos(new Date('2026-08-27T15:05:00.000Z'));

    const [primeiro, segundo] = paymentService.processWebhookEvent.mock.calls.map((c: any[]) => c[0].eventId);
    // A idempotência de `processWebhookEvent` é por `external_event_id`. Se o
    // id carregasse o relógio, cada varredura criaria um evento novo e o
    // pagamento seria fechado de novo a cada cinco minutos.
    expect(primeiro).toBe(segundo);
    expect(primeiro).not.toMatch(/\d{13}/);
  });

  it('status igual dos dois lados: não inventa evento', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca({ status: 'PENDING' })]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway({ status: 'PENDING', statusOriginal: 'pending' })));

    const resultado = await reconciliarPagamentos(AGORA);

    expect(resultado).toMatchObject({ conferidas: 1, divergentes: 0, fechadas: 0 });
    expect(paymentService.processWebhookEvent).not.toHaveBeenCalled();
  });

  it('gateway sem status bruto: erra alto em vez de gravar PENDING por engano', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway({ statusOriginal: undefined })));

    const resultado = await reconciliarPagamentos(AGORA);

    expect(paymentService.processWebhookEvent).not.toHaveBeenCalled();
    expect(resultado.erros).toBe(1);
    expect(resultado.fechadas).toBe(0);
  });

  it('uma cobrança que falha não derruba a varredura', async () => {
    prisma.payment.findMany.mockResolvedValue([
      cobranca({ id: 'pay-1', external_payment_id: '111' }),
      cobranca({ id: 'pay-2', external_payment_id: '222' })
    ]);
    paymentService.getGateway
      .mockRejectedValueOnce(new Error('credencial do tenant ausente'))
      .mockResolvedValueOnce({ getPaymentStatus: jest.fn().mockResolvedValue(respostaDoGateway()) });

    const resultado = await reconciliarPagamentos(AGORA);

    // Gateway instável ou credencial errada de UM tenant não pode impedir os
    // outros de receberem o dinheiro que já entrou.
    expect(resultado).toMatchObject({ conferidas: 2, erros: 1, fechadas: 1 });
  });

  it('só olha cobrança em aberto, com id no gateway, e depois da carência', async () => {
    prisma.payment.findMany.mockResolvedValue([]);

    await reconciliarPagamentos(AGORA);

    const { where, take } = prisma.payment.findMany.mock.calls[0][0];

    expect(where.status.in).toEqual(['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED']);
    // Sem id do gateway não há o que perguntar.
    expect(where.external_payment_id).toEqual({ not: null });
    // Carência de 3 min: antes disso o webhook ainda está a caminho, e fechar
    // pela reconciliação esconderia justamente o webhook quebrado.
    expect(where.criado_em.lt).toEqual(new Date('2026-08-27T14:57:00.000Z'));
    // Janela de 7 dias: PIX expira em 1h, cartão em minutos. Sem o piso, a
    // varredura arrastaria para sempre cobranças que ninguém vai pagar.
    expect(where.criado_em.gt).toEqual(new Date('2026-08-20T15:00:00.000Z'));
    // Teto por rodada: manutenção não compete com o produto.
    expect(take).toBe(40);
  });

  it('estado final (PAID, EXPIRED) nunca é reconferido', async () => {
    prisma.payment.findMany.mockResolvedValue([]);

    await reconciliarPagamentos(AGORA);

    const { where } = prisma.payment.findMany.mock.calls[0][0];
    ['PAID', 'EXPIRED', 'REFUNDED', 'FAILED', 'CANCELLED'].forEach((final) => {
      expect(where.status.in).not.toContain(final);
    });
  });

  it('PIX abandonado expira e sai da varredura', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    // O MP devolve 'cancelled' para o PIX que venceu; `mapStatus` traduz para
    // EXPIRED. Sem isso a cobrança ficaria PENDING sendo conferida para sempre.
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway({ status: 'EXPIRED', statusOriginal: 'cancelled' })));

    const resultado = await reconciliarPagamentos(AGORA);

    expect(resultado.fechadas).toBe(1);
    expect(paymentService.processWebhookEvent.mock.calls[0][0].paymentData.status).toBe('cancelled');
  });

  it('grita quando conserta algo — divergência é sintoma de webhook quebrado', async () => {
    prisma.payment.findMany.mockResolvedValue([cobranca()]);
    comGateway(jest.fn().mockResolvedValue(respostaDoGateway()));

    await reconciliarPagamentos(AGORA);

    // A reconciliação funcionando em silêncio é pior do que não existir: o
    // dinheiro entra e ninguém descobre que o canal rápido está morto.
    const gritos = (console.warn as jest.Mock).mock.calls.flat().join(' ');
    expect(gritos).toMatch(/webhook não fechou/i);
  });
});
