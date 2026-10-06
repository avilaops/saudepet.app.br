/**
 * O fechamento do pedido do mercado — onde estoque e dinheiro se encontram.
 *
 * Duas coisas precisam ser verdade ao mesmo tempo, e é por isso que existem
 * testes aqui em vez de confiança:
 *
 * 1. **Ninguém paga por um item que acabou.** A baixa de estoque acontece na
 *    mesma transação do pedido, com `estoque >= n` no WHERE. Quem chega depois
 *    do último saco de ração recebe "acabou" ANTES de existir cobrança.
 *
 * 2. **Mas quem não conta estoque continua vendendo.** A maioria dos petshops
 *    não faz contagem — o levantamento de 26/08/2026 voltou com 175 itens e
 *    zero contagens. Reservar estoque desses itens travaria a loja inteira no
 *    primeiro pedido.
 */

const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/mercado/carrinho.service', () => ({
  verCarrinho: jest.fn()
}));

const { verCarrinho } = require('../../../src/services/mercado/carrinho.service');
const {
  cancelarPedido,
  expirarPedidosVencidos,
  fecharPedido,
  marcarComoPago
} = require('../../../src/services/mercado/pedido.service');

const LOJA = {
  id: 'loja-1',
  nome_fantasia: 'Casa de Rações Filhos de 4 Patas',
  slug: 'filhos-de-4-patas',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  status: 'aprovada',
  prazo_preparo_min: 60,
  pedido_minimo: 0,
  aceita_retirada: true,
  aceita_combinar: true
};

function itemDoCarrinho(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'item-1',
    produto_id: 'produto-1',
    quantidade: 2,
    quantidade_disponivel: 2,
    nome: 'Golden Formula Cães Adultos 15 kg',
    variacao: 'Frango e arroz',
    unidade: 'saco',
    granel: false,
    preco: 196.5,
    preco_cheio: 196.5,
    em_promocao: false,
    exige_receita: false,
    sob_encomenda: false,
    prazo_reposicao_dias: null,
    disponivel: true,
    subtotal: 393,
    ...sobrescreve
  };
}

function carrinhoPronto(sobrescreve: Record<string, unknown> = {}) {
  const itens = (sobrescreve.itens as unknown[]) || [itemDoCarrinho()];
  return {
    id: 'carrinho-1',
    loja: LOJA,
    itens,
    subtotal: 393,
    total_itens: 2,
    exige_receita: false,
    prazo_encomenda_dias: null,
    impedimentos: [],
    alertas: [],
    ...sobrescreve
  };
}

/** O produto como ele é lido DENTRO da transação, na hora de reservar. */
function produtoNoBanco(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'produto-1',
    nome: 'Golden Formula Cães Adultos 15 kg',
    ativo: true,
    controla_estoque: true,
    sob_encomenda: false,
    ...sobrescreve
  };
}

function prepararFechamento(opcoes: { produtos?: unknown[]; baixa?: number } = {}) {
  prisma.lojaMercado.findFirst.mockResolvedValue({ id: LOJA.id, comissao_pct: null });
  prisma.configuracaoTenant.findUnique.mockResolvedValue({ comissao_plataforma_pct: 15 });
  prisma.produtoMercado.findMany.mockResolvedValue(opcoes.produtos || [produtoNoBanco()]);
  prisma.produtoMercado.updateMany.mockResolvedValue({ count: opcoes.baixa ?? 1 });
  prisma.pedidoMercado.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
    Promise.resolve({ id: 'pedido-1', codigo: data.codigo, ...data })
  );
  prisma.eventoPedidoMercado.create.mockResolvedValue({});
  prisma.carrinhoMercado.deleteMany.mockResolvedValue({ count: 1 });
}

const PEDIDO_BASE = {
  tenantId: 'tenant-1',
  tutorId: 'tutor-1',
  lojaId: 'loja-1',
  entregaTipo: 'retirada'
};

describe('Fechar pedido: a reserva de estoque', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verCarrinho.mockResolvedValue(carrinhoPronto());
  });

  it('baixa o estoque de quem faz contagem, com o piso no WHERE', async () => {
    prepararFechamento();

    await fecharPedido(PEDIDO_BASE);

    expect(prisma.produtoMercado.updateMany).toHaveBeenCalledTimes(1);
    const chamada = prisma.produtoMercado.updateMany.mock.calls[0][0];
    // O `gte` é a trava: sem ele, duas compras simultâneas do último item
    // passariam as duas e uma das duas seria impossível de separar.
    expect(chamada.where).toMatchObject({ id: 'produto-1', ativo: true, estoque: { gte: 2 } });
    expect(chamada.data).toEqual({ estoque: { decrement: 2 } });
  });

  it('NÃO baixa estoque de loja que não faz contagem', async () => {
    prepararFechamento({ produtos: [produtoNoBanco({ controla_estoque: false })] });

    const pedido = await fecharPedido(PEDIDO_BASE);

    expect(prisma.produtoMercado.updateMany).not.toHaveBeenCalled();
    expect(pedido).toBeTruthy();
  });

  it('NÃO baixa estoque de item sob encomenda — ele nem está na loja', async () => {
    prepararFechamento({ produtos: [produtoNoBanco({ sob_encomenda: true })] });

    await fecharPedido(PEDIDO_BASE);

    expect(prisma.produtoMercado.updateMany).not.toHaveBeenCalled();
  });

  it('recusa o pedido quando o item acabou entre a vitrine e o fechamento', async () => {
    // `count: 0` é a segunda compra do último item chegando atrasada.
    prepararFechamento({ baixa: 0 });

    await expect(fecharPedido(PEDIDO_BASE)).rejects.toThrow(/acabou de sair de estoque/i);
    // O que importa: nenhum pedido foi criado, então nenhuma cobrança nasceu.
    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });

  it('recusa o pedido quando o produto saiu do catálogo no meio do caminho', async () => {
    prepararFechamento({ produtos: [produtoNoBanco({ ativo: false })] });

    await expect(fecharPedido(PEDIDO_BASE)).rejects.toThrow(/saiu do catálogo/i);
    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });
});

describe('Fechar pedido: o dinheiro', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verCarrinho.mockResolvedValue(carrinhoPronto());
  });

  it('reparte pela comissão do tenant quando a loja não tem a própria', async () => {
    prepararFechamento();

    const pedido = await fecharPedido(PEDIDO_BASE);

    expect(Number(pedido.total)).toBe(393);
    expect(Number(pedido.comissao_pct)).toBe(15);
    expect(Number(pedido.comissao_valor)).toBe(58.95);
    expect(Number(pedido.repasse_loja)).toBe(334.05);
    // A soma tem de fechar exatamente com o que o tutor paga. Um centavo de
    // sobra aqui vira divergência no fechamento do mês.
    expect(Number(pedido.comissao_valor) + Number(pedido.repasse_loja)).toBeCloseTo(393, 2);
  });

  it('usa a comissão negociada com a loja quando ela existe', async () => {
    prepararFechamento();
    prisma.lojaMercado.findFirst.mockResolvedValue({ id: LOJA.id, comissao_pct: 8 });

    const pedido = await fecharPedido(PEDIDO_BASE);

    expect(Number(pedido.comissao_pct)).toBe(8);
    expect(Number(pedido.comissao_valor)).toBe(31.44);
    expect(Number(pedido.repasse_loja)).toBe(361.56);
    // A configuração do tenant nem é consultada: a da loja já resolveu.
    expect(prisma.configuracaoTenant.findUnique).not.toHaveBeenCalled();
  });

  it('nasce esperando pagamento, nunca pago', async () => {
    prepararFechamento();

    const pedido = await fecharPedido(PEDIDO_BASE);

    expect(pedido.status).toBe('aguardando_pagamento');
    expect(pedido.expira_em).toBeInstanceOf(Date);
  });

  it('esvazia o carrinho para ninguém comprar duas vezes ao voltar a tela', async () => {
    prepararFechamento();

    await fecharPedido(PEDIDO_BASE);

    expect(prisma.carrinhoMercado.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-1', tutor_id: 'tutor-1', loja_id: 'loja-1' }
    });
  });
});

describe('Fechar pedido: o que a tela prometeu', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    verCarrinho.mockResolvedValue(carrinhoPronto());
    prepararFechamento();
  });

  it('não deixa fechar carrinho com impedimento', async () => {
    verCarrinho.mockResolvedValue(
      carrinhoPronto({ impedimentos: ['"Areia Sanitária" está sem estoque.'] })
    );

    await expect(fecharPedido(PEDIDO_BASE)).rejects.toThrow(/sem estoque/i);
    expect(prisma.produtoMercado.updateMany).not.toHaveBeenCalled();
  });

  it('recusa entrega por ENTREGADOR — ela ainda não existe', async () => {
    // O valor está no enum para não exigir migração de tipo depois. Aceitá-lo
    // aqui seria vender uma entrega que não sai.
    await expect(fecharPedido({ ...PEDIDO_BASE, entregaTipo: 'entregador' })).rejects.toThrow(
      /forma de entrega disponível/i
    );
  });

  it('exige endereço quando a entrega é combinada', async () => {
    await expect(
      fecharPedido({ ...PEDIDO_BASE, entregaTipo: 'combinar', endereco: { endereco: 'x' } })
    ).rejects.toThrow(/endereço de entrega/i);
  });

  it('guarda o endereço como CÓPIA, não como referência', async () => {
    const pedido = await fecharPedido({
      ...PEDIDO_BASE,
      entregaTipo: 'combinar',
      endereco: { endereco: 'Rua das Palmeiras, 120', complemento: 'fundos' }
    });

    expect(pedido.entrega_endereco).toBe('Rua das Palmeiras, 120');
    expect(pedido.entrega_complemento).toBe('fundos');
    // Sem cidade informada, herda a da loja — o pedido nunca fica sem cidade.
    expect(pedido.entrega_cidade).toBe('Ribeirão Preto');
  });

  it('não deixa a loja receber retirada quando ela não faz retirada', async () => {
    verCarrinho.mockResolvedValue(
      carrinhoPronto({ loja: { ...LOJA, aceita_retirada: false } })
    );

    await expect(fecharPedido(PEDIDO_BASE)).rejects.toThrow(/não faz retirada/i);
  });

  it('carrega o prazo da encomenda para o item do pedido', async () => {
    verCarrinho.mockResolvedValue(
      carrinhoPronto({
        itens: [itemDoCarrinho({ sob_encomenda: true, prazo_reposicao_dias: 5 })]
      })
    );
    prepararFechamento({ produtos: [produtoNoBanco({ sob_encomenda: true })] });

    await fecharPedido(PEDIDO_BASE);

    const criado = prisma.pedidoMercado.create.mock.calls[0][0];
    // A promessa vive no ITEM, e não no produto: mudar o cadastro amanhã não
    // pode reescrever o prazo que o tutor leu antes de pagar.
    expect(criado.data.itens.create[0].prazo_encomenda_dias).toBe(5);
  });
});

describe('Pagamento confirmado', () => {
  beforeEach(() => jest.clearAllMocks());

  it('libera a separação e apaga o prazo de expiração', async () => {
    prisma.pedidoMercado.findUnique.mockResolvedValue({
      id: 'pedido-1',
      status: 'aguardando_pagamento',
      loja_id: 'loja-1',
      tutor_id: 'tutor-1',
      codigo: 'MER-ABC234'
    });
    prisma.pedidoMercado.update.mockResolvedValue({ id: 'pedido-1', status: 'pago' });
    prisma.eventoPedidoMercado.create.mockResolvedValue({});

    await marcarComoPago({ pedidoId: 'pedido-1', paymentId: 'pay-1' });

    const atualizacao = prisma.pedidoMercado.update.mock.calls[0][0];
    expect(atualizacao.data.status).toBe('pago');
    // Pago é pago: o relógio que devolvia o estoque não vale mais.
    expect(atualizacao.data.expira_em).toBeNull();
    expect(atualizacao.data.payment_id).toBe('pay-1');
  });

  it('não empurra de novo um pedido que a loja já separou', async () => {
    // O gateway reenvia o mesmo evento. Reprocessar não pode voltar o pedido.
    prisma.pedidoMercado.findUnique.mockResolvedValue({
      id: 'pedido-1',
      status: 'em_separacao',
      loja_id: 'loja-1',
      tutor_id: 'tutor-1',
      codigo: 'MER-ABC234'
    });

    const resultado = await marcarComoPago({ pedidoId: 'pedido-1', paymentId: 'pay-1' });

    expect(prisma.pedidoMercado.update).not.toHaveBeenCalled();
    expect(resultado.status).toBe('em_separacao');
  });
});

describe('Cancelamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.itemPedidoMercado.findMany.mockResolvedValue([{ produto_id: 'produto-1', quantidade: 2 }]);
    prisma.produtoMercado.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventoPedidoMercado.create.mockResolvedValue({});
  });

  it('devolve o estoque e avisa que o estorno é devido quando já estava pago', async () => {
    prisma.pedidoMercado.findFirst.mockResolvedValue({
      id: 'pedido-1',
      status: 'pago',
      payment_id: 'pay-1',
      codigo: 'MER-ABC234',
      loja_id: 'loja-1',
      tutor_id: 'tutor-1'
    });
    prisma.pedidoMercado.update.mockResolvedValue({ id: 'pedido-1', codigo: 'MER-ABC234', status: 'cancelado' });

    const resultado = await cancelarPedido({
      tenantId: 'tenant-1',
      pedidoId: 'pedido-1',
      motivo: 'Comprei sem querer',
      atorId: 'tutor-1',
      atorPapel: 'tutor',
      tutorId: 'tutor-1'
    });

    // A devolução é condicionada: item de loja sem contagem nunca reservou nada
    // e não pode ganhar estoque do nada.
    expect(prisma.produtoMercado.updateMany).toHaveBeenCalledWith({
      where: { id: 'produto-1', controla_estoque: true, sob_encomenda: false },
      data: { estoque: { increment: 2 } }
    });
    expect(resultado.estornoDevido).toBe(true);
    expect(resultado.paymentId).toBe('pay-1');
  });

  it('o tutor não cancela pedido que a loja já começou a separar', async () => {
    prisma.pedidoMercado.findFirst.mockResolvedValue({
      id: 'pedido-1',
      status: 'em_separacao',
      payment_id: 'pay-1',
      codigo: 'MER-ABC234',
      loja_id: 'loja-1',
      tutor_id: 'tutor-1'
    });

    await expect(
      cancelarPedido({
        tenantId: 'tenant-1',
        pedidoId: 'pedido-1',
        motivo: 'mudei de ideia',
        atorId: 'tutor-1',
        atorPapel: 'tutor',
        tutorId: 'tutor-1'
      })
    ).rejects.toThrow(/já entrou em separação/i);
  });

  it('a loja PODE cancelar o que já está em separação', async () => {
    prisma.pedidoMercado.findFirst.mockResolvedValue({
      id: 'pedido-1',
      status: 'em_separacao',
      payment_id: 'pay-1',
      codigo: 'MER-ABC234',
      loja_id: 'loja-1',
      tutor_id: 'tutor-1'
    });
    prisma.pedidoMercado.update.mockResolvedValue({ id: 'pedido-1', codigo: 'MER-ABC234', status: 'cancelado' });

    const resultado = await cancelarPedido({
      tenantId: 'tenant-1',
      pedidoId: 'pedido-1',
      motivo: 'Produto avariado no estoque',
      atorId: 'lojista-1',
      atorPapel: 'loja',
      lojaId: 'loja-1'
    });

    expect(resultado.pedido.status).toBe('cancelado');
    expect(resultado.estornoDevido).toBe(false); // já não estava em `pago`
  });

  it('exige motivo por escrito', async () => {
    await expect(
      cancelarPedido({
        tenantId: 'tenant-1',
        pedidoId: 'pedido-1',
        motivo: '',
        atorId: 'tutor-1',
        atorPapel: 'tutor',
        tutorId: 'tutor-1'
      })
    ).rejects.toThrow(/motivo/i);
  });
});

describe('Pedido vencido sem pagamento', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.itemPedidoMercado.findMany.mockResolvedValue([{ produto_id: 'produto-1', quantidade: 2 }]);
    prisma.produtoMercado.updateMany.mockResolvedValue({ count: 1 });
    prisma.eventoPedidoMercado.create.mockResolvedValue({});
    prisma.pedidoMercado.update.mockResolvedValue({});
  });

  it('devolve o estoque de quem não pagou no prazo', async () => {
    prisma.pedidoMercado.findMany.mockResolvedValue([{ id: 'pedido-1' }]);
    prisma.pedidoMercado.findFirst.mockResolvedValue({ id: 'pedido-1', status: 'aguardando_pagamento' });

    const resultado = await expirarPedidosVencidos(new Date());

    expect(resultado.expirados).toBe(1);
    expect(prisma.produtoMercado.updateMany).toHaveBeenCalled();
  });

  it('não expira o pedido cujo pagamento entrou entre a busca e a transação', async () => {
    prisma.pedidoMercado.findMany.mockResolvedValue([{ id: 'pedido-1' }]);
    // A releitura DENTRO da transação não encontra mais o pedido em
    // `aguardando_pagamento` — o webhook chegou primeiro.
    prisma.pedidoMercado.findFirst.mockResolvedValue(null);

    const resultado = await expirarPedidosVencidos(new Date());

    expect(resultado.expirados).toBe(0);
    // O que não pode acontecer de jeito nenhum: devolver ao estoque o que a
    // loja precisa separar.
    expect(prisma.produtoMercado.updateMany).not.toHaveBeenCalled();
  });
});
