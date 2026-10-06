/**
 * A carteira do tutor.
 *
 * O que estes casos travam: o número do cartão nunca chega ao nosso servidor
 * (só o token do navegador), o cartão só some da tela depois de sumir do
 * gateway, e a carteira nunca fica sem um principal — senão o checkout deixa de
 * pré-escolher e a conveniência inteira se perde.
 */

const prisma = require('../../../src/config/database');
const servico = require('../../../src/services/cartao-salvo.service');

const USUARIO = 'tutor-1';
const TENANT = 'tenant-1';

function gatewayFalso() {
  return {
    ensureCustomer: jest.fn().mockResolvedValue('cus_1'),
    saveCard: jest.fn().mockResolvedValue({
      cardId: 'card_1',
      bandeira: 'Visa',
      ultimosDigitos: '4242',
      validadeMes: 11,
      validadeAno: 2030
    }),
    deleteCard: jest.fn().mockResolvedValue(undefined)
  };
}

describe('Cartão salvo', () => {
  let gateway: ReturnType<typeof gatewayFalso>;

  beforeEach(() => {
    jest.clearAllMocks();
    gateway = gatewayFalso();
    prisma.usuario.findFirst.mockResolvedValue({
      id: USUARIO, email: 'marina@exemplo.com.br', nome: 'Marina Alves', cpf: null
    });
    prisma.cartaoSalvo.count.mockResolvedValue(0);
    prisma.cartaoSalvo.upsert.mockResolvedValue({ id: 'cartao-1', ultimos_digitos: '4242' });
    prisma.cartaoSalvo.findMany.mockResolvedValue([]);
    prisma.cartaoSalvo.findFirst.mockResolvedValue(null);
    prisma.cartaoSalvo.delete.mockResolvedValue({});
    prisma.cartaoSalvo.update.mockResolvedValue({});
    prisma.$transaction.mockResolvedValue([]);
  });

  const pedido = { usuarioId: USUARIO, tenantId: TENANT, cardToken: 'tok_navegador' };

  describe('guardar', () => {
    it('grava referência do gateway, e nunca dados do cartão', async () => {
      await servico.salvarCartao({ ...pedido, gateway });

      const gravado = prisma.cartaoSalvo.upsert.mock.calls[0][0].create;
      expect(gravado).toEqual(
        expect.objectContaining({ customer_id: 'cus_1', card_id: 'card_1', ultimos_digitos: '4242' })
      );
      // O que não pode estar lá é tão importante quanto o que está.
      expect(JSON.stringify(gravado)).not.toContain('tok_navegador');
      expect(gravado).not.toHaveProperty('numero');
      expect(gravado).not.toHaveProperty('cvv');
    });

    it('sem token não chega a falar com o gateway', async () => {
      await expect(
        servico.salvarCartao({ ...pedido, cardToken: '', gateway })
      ).rejects.toThrow(/token gerado pelo navegador/i);
      expect(gateway.ensureCustomer).not.toHaveBeenCalled();
    });

    it('o primeiro cartão vira principal sozinho', async () => {
      await servico.salvarCartao({ ...pedido, gateway });
      expect(prisma.cartaoSalvo.upsert.mock.calls[0][0].create.principal).toBe(true);
    });

    it('o segundo não rouba o lugar do principal', async () => {
      prisma.cartaoSalvo.count.mockResolvedValue(1);
      await servico.salvarCartao({ ...pedido, gateway });
      expect(prisma.cartaoSalvo.upsert.mock.calls[0][0].create.principal).toBe(false);
    });

    it('salvar o mesmo cartão de novo atualiza em vez de recusar', async () => {
      await servico.salvarCartao({ ...pedido, gateway });
      const chamada = prisma.cartaoSalvo.upsert.mock.calls[0][0];
      expect(chamada.where.usuario_id_gateway_card_id).toEqual({
        usuario_id: USUARIO, gateway: 'mercadopago', card_id: 'card_1'
      });
    });

    it('respeita o teto da carteira', async () => {
      prisma.cartaoSalvo.count.mockResolvedValue(servico.MAXIMO_POR_PESSOA);

      await expect(servico.salvarCartao({ ...pedido, gateway })).rejects.toThrow(/Remova um/i);
      expect(gateway.saveCard).not.toHaveBeenCalled();
    });
  });

  describe('remover', () => {
    beforeEach(() => {
      prisma.cartaoSalvo.findFirst.mockResolvedValue({
        id: 'cartao-1', customer_id: 'cus_1', card_id: 'card_1', principal: false
      });
    });

    it('apaga no gateway antes de apagar aqui', async () => {
      await servico.removerCartao({ cartaoId: 'cartao-1', usuarioId: USUARIO, tenantId: TENANT, gateway });

      expect(gateway.deleteCard).toHaveBeenCalledWith({ customerId: 'cus_1', cardId: 'card_1' });
      expect(prisma.cartaoSalvo.delete).toHaveBeenCalled();
    });

    it('falha no gateway mantém a linha — sumir da tela um cartão cobrável é pior', async () => {
      gateway.deleteCard.mockRejectedValue(new Error('gateway fora'));

      await expect(
        servico.removerCartao({ cartaoId: 'cartao-1', usuarioId: USUARIO, tenantId: TENANT, gateway })
      ).rejects.toThrow('gateway fora');
      expect(prisma.cartaoSalvo.delete).not.toHaveBeenCalled();
    });

    it('remover o principal promove outro — carteira sem principal não pré-escolhe', async () => {
      prisma.cartaoSalvo.findFirst
        .mockResolvedValueOnce({ id: 'cartao-1', customer_id: 'cus_1', card_id: 'card_1', principal: true })
        .mockResolvedValueOnce({ id: 'cartao-2' });

      await servico.removerCartao({ cartaoId: 'cartao-1', usuarioId: USUARIO, tenantId: TENANT, gateway });

      expect(prisma.cartaoSalvo.update).toHaveBeenCalledWith({
        where: { id: 'cartao-2' }, data: { principal: true }
      });
    });

    it('não remove cartão de outra pessoa', async () => {
      prisma.cartaoSalvo.findFirst.mockResolvedValue(null);

      await expect(
        servico.removerCartao({ cartaoId: 'cartao-1', usuarioId: 'outro', tenantId: TENANT, gateway })
      ).rejects.toThrow(/não encontrado/i);
      expect(gateway.deleteCard).not.toHaveBeenCalled();
    });
  });

  describe('principal', () => {
    it('troca os dois na mesma transação', async () => {
      prisma.cartaoSalvo.findFirst.mockResolvedValue({ id: 'cartao-2' });

      await servico.definirPrincipal({ cartaoId: 'cartao-2', usuarioId: USUARIO, tenantId: TENANT });

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.cartaoSalvo.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { principal: false } })
      );
    });
  });
});
