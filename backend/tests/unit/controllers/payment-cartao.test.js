const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/payment/payment.service', () => ({
  createPaymentIntent: jest.fn().mockResolvedValue({ id: 'pay-1', status: 'CREATED' })
}));

const paymentService = require('../../../src/services/payment/payment.service');
const controller = require('../../../src/controllers/payment.controller');

const res = () => ({ json: jest.fn(), status: jest.fn().mockReturnThis() });
const next = (erro) => { throw erro; };

function req(body = {}) {
  return { body: { atendimentoId: 'atend-1', ...body }, tenantId: 'tenant-1', userId: 'tutor-1' };
}

describe('Checkout com cartão', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.payment.findFirst.mockResolvedValue(null);
    // A cidade vem do TUTOR — `Solicitacao` não tem esse campo, e selecioná-lo
    // derrubava todo o checkout com erro de validação do Prisma.
    prisma.solicitacao.findFirst.mockResolvedValue({
      id: 'atend-1', tipo_atendimento: 'consulta_domiciliar', tutor: { cidade: 'São Paulo' }
    });
    prisma.cidadeCobertura.findFirst.mockResolvedValue({
      preco_emergencia: 200, preco_domiciliar: 150, preco_teleorientacao: 80
    });
  });

  it('recusa cartão sem o token gerado no navegador', async () => {
    // O gateway exige o token; aceitar sem ele criava cobrança que falhava
    // depois, e antes o cliente ainda mandava número e CVV para cá.
    await expect(
      controller.createCheckout(req({ method: 'CREDIT_CARD' }), res(), next)
    ).rejects.toThrow(/token gerado no navegador/i);

    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
  });

  it('repassa o token ao serviço de pagamento', async () => {
    await controller.createCheckout(req({ method: 'CREDIT_CARD', cardToken: 'tok_123' }), res(), next);

    const argumentos = paymentService.createPaymentIntent.mock.calls[0][0];
    expect(argumentos.cardToken).toBe('tok_123');
    expect(argumentos.method).toBe('CREDIT_CARD');
  });

  it('nunca repassa número, CVV ou nome do cartão, mesmo se enviados', async () => {
    await controller.createCheckout(
      req({ method: 'CREDIT_CARD', cardToken: 'tok_123', cardDetails: { number: '4111111111111111', ccv: '123' } }),
      res(),
      next
    );

    const argumentos = paymentService.createPaymentIntent.mock.calls[0][0];
    const enviado = JSON.stringify(argumentos);
    expect(enviado).not.toMatch(/4111111111111111/);
    expect(enviado).not.toMatch(/"ccv"/);
    expect(enviado).not.toMatch(/holderName/);
  });

  it('aceita o número de parcelas, que não é dado sensível', async () => {
    await controller.createCheckout(req({ method: 'CREDIT_CARD', cardToken: 'tok_1', parcelas: 3 }), res(), next);

    expect(paymentService.createPaymentIntent.mock.calls[0][0].cardDetails).toEqual({ installments: 3 });
  });

  it('busca a cidade pelo tutor, não por um campo inexistente em Solicitacao', async () => {
    await controller.createCheckout(req({ method: 'PIX' }), res(), next);

    const select = prisma.solicitacao.findFirst.mock.calls[0][0].select;
    expect(select.cidade).toBeUndefined();
    expect(select.tutor).toEqual({ select: { cidade: true } });
  });

  it('usa o preço da cidade do tutor', async () => {
    await controller.createCheckout(req({ method: 'PIX' }), res(), next);
    expect(paymentService.createPaymentIntent.mock.calls[0][0].amount).toBe(150);
  });

  it('PIX segue sem exigir token', async () => {
    await controller.createCheckout(req({ method: 'PIX' }), res(), next);

    expect(paymentService.createPaymentIntent).toHaveBeenCalled();
    expect(paymentService.createPaymentIntent.mock.calls[0][0].cardToken).toBeUndefined();
  });
});
