// Assinatura paga precisa de cobrança de verdade.
//
// `assinarPlano` criava a assinatura já como 'ativa' e uma `Transacao` pendente
// que nenhum ponto do sistema processava: o plano pago do tutor e o CRM pago do
// veterinário eram liberados de graça, para sempre.
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/payment/payment.service', () => ({
  createPaymentIntent: jest.fn()
}));

const paymentService = require('../../../src/services/payment/payment.service');
const billing = require('../../../src/controllers/billing.controller');

const res = () => {
  const r = {};
  r.json = jest.fn().mockReturnValue(r);
  r.status = jest.fn().mockReturnValue(r);
  return r;
};
const next = (erro) => { throw erro; };

const req = (body) => ({ body, user: { id: 'user-1', tenant_id: 'tenant-1' } });

const plano = (valor = 49.9) => ({
  id: 'plano-1', tenant_id: 'tenant-1', nome: 'Clube Vet', valor_mensal: valor, ativo: true
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.planoAssinatura.findFirst.mockResolvedValue(plano());
  prisma.assinaturaUsuario.findFirst.mockResolvedValue(null);
  prisma.assinaturaUsuario.create.mockImplementation(({ data }) =>
    Promise.resolve({ id: 'assin-1', ...data, plano: plano() }));
  prisma.assinaturaUsuario.delete.mockResolvedValue({});
  paymentService.createPaymentIntent.mockResolvedValue({ id: 'pay-1', status: 'PENDING', pix_copy_paste: '000201...' });
});

describe('Assinar plano pago', () => {
  it('nasce pendente — não mais ativa sem ninguém ter pago', async () => {
    await billing.assinarPlano(req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), res(), next);

    expect(prisma.assinaturaUsuario.create.mock.calls[0][0].data.status).toBe('pendente');
  });

  it('abre cobrança real no gateway, vinculada à assinatura', async () => {
    await billing.assinarPlano(req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), res(), next);

    const cobranca = paymentService.createPaymentIntent.mock.calls[0][0];
    expect(cobranca.assinaturaId).toBe('assin-1');
    expect(cobranca.amount).toBe(49.9);
    expect(cobranca.atendimentoId).toBeNull();
  });

  it('traduz o método para o vocabulário do gateway', async () => {
    // O schema fala 'pix'/'cartao_credito'; o gateway espera 'PIX'/'CREDIT_CARD'.
    await billing.assinarPlano(
      req({ plano_id: 'plano-1', metodo_pagamento: 'cartao_credito', cardToken: 'tok_abcdefghij', aceitar_termos: true }),
      res(), next
    );

    expect(paymentService.createPaymentIntent.mock.calls[0][0].method).toBe('CREDIT_CARD');
  });

  it('recusa cartão sem o token gerado no navegador', async () => {
    await expect(billing.assinarPlano(
      req({ plano_id: 'plano-1', metodo_pagamento: 'cartao_credito', aceitar_termos: true }), res(), next
    )).rejects.toThrow(/token gerado no navegador/i);

    expect(prisma.assinaturaUsuario.create).not.toHaveBeenCalled();
  });

  it('devolve a cobrança para a tela concluir o pagamento', async () => {
    const r = res();
    await billing.assinarPlano(req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), r, next);

    const resposta = r.json.mock.calls[0][0];
    expect(resposta.pagamento).toEqual(expect.objectContaining({ id: 'pay-1' }));
    expect(resposta.message).toMatch(/conclua o pagamento/i);
  });

  it('não deixa assinatura pendente órfã quando o gateway falha', async () => {
    // Senão o usuário tentaria de novo e ouviria "você já tem uma assinatura
    // aguardando pagamento" — travado sem ter pago nada.
    paymentService.createPaymentIntent.mockRejectedValue(new Error('gateway fora do ar'));

    await expect(billing.assinarPlano(
      req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), res(), next
    )).rejects.toThrow(/gateway fora do ar/);

    expect(prisma.assinaturaUsuario.delete).toHaveBeenCalledWith({ where: { id: 'assin-1' } });
  });

  it('bloqueia segunda assinatura enquanto uma espera pagamento', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue({ id: 'assin-0', status: 'pendente' });

    await expect(billing.assinarPlano(
      req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), res(), next
    )).rejects.toThrow(/aguardando pagamento/i);
  });

  it('bloqueia quem já tem assinatura ativa', async () => {
    prisma.assinaturaUsuario.findFirst.mockResolvedValue({ id: 'assin-0', status: 'ativa' });

    await expect(billing.assinarPlano(
      req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), res(), next
    )).rejects.toThrow(/já possui uma assinatura ativa/i);
  });
});

describe('Assinar plano gratuito', () => {
  it('ativa na hora e não abre cobrança', async () => {
    prisma.planoAssinatura.findFirst.mockResolvedValue(plano(0));

    const r = res();
    await billing.assinarPlano(req({ plano_id: 'plano-1', metodo_pagamento: 'pix', aceitar_termos: true }), r, next);

    expect(prisma.assinaturaUsuario.create.mock.calls[0][0].data.status).toBe('ativa');
    expect(paymentService.createPaymentIntent).not.toHaveBeenCalled();
    expect(r.json.mock.calls[0][0].pagamento).toBeNull();
  });
});

export {};
