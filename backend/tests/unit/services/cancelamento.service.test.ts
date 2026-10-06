/**
 * O que acontece com o dinheiro quando alguém cancela.
 *
 * Até aqui: nada. O tutor cancelava e o pagamento ficava parado esperando
 * alguém lembrar de estornar pelo painel. Estes casos travam a regra e, mais
 * importante, travam que falha de gateway não desfaça o cancelamento.
 */

jest.mock('../../../src/services/payment/payment.service', () => ({
  refundPayment: jest.fn()
}));

const prisma = require('../../../src/config/database');
const paymentService = require('../../../src/services/payment/payment.service');
const servico = require('../../../src/services/cancelamento.service');

describe('Política de cancelamento', () => {
  it('antes de alguém aceitar, cancelar é livre', () => {
    for (const status of ['criado', 'procurando_veterinario', 'veterinario_encontrado', 'aceito']) {
      const politica = servico.politicaDeCancelamento({ status, quemCancelou: 'tutor' });
      expect(politica.reembolso).toBe('integral');
      expect(politica.percentual_retido).toBe(0);
    }
  });

  it('com o profissional na rua, fica a taxa de deslocamento', () => {
    for (const status of ['a_caminho', 'chegou']) {
      const politica = servico.politicaDeCancelamento({ status, quemCancelou: 'tutor' });
      expect(politica.reembolso).toBe('parcial');
      expect(politica.percentual_retido).toBe(servico.PERCENTUAL_DESLOCAMENTO);
      // A frase precisa explicar, não só classificar.
      expect(politica.texto).toMatch(/deslocamento/i);
    }
  });

  it('depois que o atendimento começou, não há devolução automática', () => {
    const politica = servico.politicaDeCancelamento({
      status: 'atendimento_em_andamento', quemCancelou: 'tutor'
    });
    expect(politica.reembolso).toBe('nenhum');
    // Mas a porta não fecha: contestação é caminho de gente.
    expect(politica.texto).toMatch(/fale conosco/i);
  });

  it('desistência do veterinário devolve tudo, em qualquer etapa', () => {
    for (const status of ['aceito', 'a_caminho', 'chegou']) {
      const politica = servico.politicaDeCancelamento({ status, quemCancelou: 'veterinario' });
      expect(politica.reembolso).toBe('integral');
    }
  });
});

describe('Estorno do cancelamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.payment.findFirst.mockResolvedValue({ id: 'pag-1', amount: 150 });
    paymentService.refundPayment.mockResolvedValue({});
  });

  const pedido = { atendimentoId: 'atend-1', tenantId: 'tenant-1', usuarioId: 'tutor-1' };

  it('devolve o valor cheio quando ninguém saiu de casa', async () => {
    const resultado = await servico.reembolsarCancelamento({
      ...pedido, status: 'procurando_veterinario', quemCancelou: 'tutor'
    });

    expect(paymentService.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ paymentId: 'pag-1', amount: 150 })
    );
    expect(resultado.estornado).toBe(150);
  });

  it('retém a taxa quando o profissional já estava a caminho', async () => {
    const resultado = await servico.reembolsarCancelamento({
      ...pedido, status: 'a_caminho', quemCancelou: 'tutor'
    });

    // 20% de 150 ficam retidos.
    expect(resultado.estornado).toBe(120);
    expect(paymentService.refundPayment).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 120 })
    );
  });

  it('atendimento já iniciado não aciona estorno nenhum', async () => {
    const resultado = await servico.reembolsarCancelamento({
      ...pedido, status: 'atendimento_em_andamento', quemCancelou: 'tutor'
    });

    expect(paymentService.refundPayment).not.toHaveBeenCalled();
    expect(resultado.motivo).toBe('sem_reembolso');
  });

  it('sem pagamento aprovado não há o que devolver — e não é erro', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);

    const resultado = await servico.reembolsarCancelamento({
      ...pedido, status: 'criado', quemCancelou: 'tutor'
    });

    expect(resultado.motivo).toBe('sem_pagamento');
    expect(paymentService.refundPayment).not.toHaveBeenCalled();
  });

  it('gateway fora não desfaz o cancelamento — registra e segue', async () => {
    paymentService.refundPayment.mockRejectedValue(new Error('gateway indisponível'));

    const resultado = await servico.reembolsarCancelamento({
      ...pedido, status: 'aceito', quemCancelou: 'tutor'
    });

    expect(resultado.motivo).toBe('falhou');
    expect(resultado.erro).toMatch(/indisponível/);
  });

  it('só considera pagamento aprovado — pendente não se estorna', async () => {
    await servico.reembolsarCancelamento({ ...pedido, status: 'aceito', quemCancelou: 'tutor' });

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'PAID' }) })
    );
  });
});
