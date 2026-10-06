/**
 * O carrinho do mercado não corrige em silêncio.
 *
 * Entre encher o carrinho e voltar nele, o mundo muda: a loja subiu o preço,
 * tirou o produto do catálogo, ficou com menos peças, foi suspensa. O pior
 * desenho possível é a pessoa descobrir isso na tela de pagamento — ou pior
 * ainda, não descobrir e pagar um valor diferente do que viu.
 *
 * Por isso a leitura devolve duas listas: `impedimentos` (impede o fechamento e
 * diz por quê) e `alertas` (não impede, mas a pessoa precisa saber). Estes
 * testes prendem exatamente essa fronteira.
 */

const prisma = require('../../../src/config/database');
const { adicionarItem, verCarrinho } = require('../../../src/services/mercado/carrinho.service');

const LOJA = {
  id: 'loja-1',
  nome_fantasia: 'Casa de Rações Filhos de 4 Patas',
  slug: 'filhos-de-4-patas',
  cidade: 'Ribeirão Preto',
  estado: 'SP',
  prazo_preparo_min: 60,
  pedido_minimo: 0,
  aceita_retirada: true,
  aceita_combinar: true,
  status: 'aprovada'
};

function produto(sobrescreve: Record<string, unknown> = {}) {
  return {
    id: 'produto-1',
    nome: 'Golden Formula Cães Adultos 15 kg',
    slug: 'golden-formula-15-kg',
    marca: 'Golden (PremieRpet)',
    variacao: 'Frango e arroz',
    tamanho: '15 kg',
    imagem_url: null,
    unidade: 'saco',
    granel: false,
    preco: 196.5,
    preco_promocional: null,
    estoque: 10,
    controla_estoque: true,
    sob_encomenda: false,
    prazo_reposicao_dias: null,
    exige_receita: false,
    ativo: true,
    ...sobrescreve
  };
}

function carrinhoNoBanco(itens: Array<{ quantidade: number; produto: Record<string, unknown> }>, loja = LOJA) {
  prisma.carrinhoMercado.findFirst.mockResolvedValue({
    id: 'carrinho-1',
    loja,
    itens: itens.map((item, indice) => ({ id: `item-${indice}`, ...item }))
  });
}

const CONTEXTO = { tenantId: 'tenant-1', tutorId: 'tutor-1', lojaId: 'loja-1' };

describe('O carrinho conta o que mudou', () => {
  beforeEach(() => jest.clearAllMocks());

  it('soma o subtotal pelo preço vigente, não pelo de tabela', async () => {
    carrinhoNoBanco([{ quantidade: 2, produto: produto({ preco: 196.5, preco_promocional: 175.9 }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.itens[0].preco).toBe(175.9);
    expect(carrinho.itens[0].em_promocao).toBe(true);
    expect(carrinho.subtotal).toBe(351.8);
    expect(carrinho.impedimentos).toHaveLength(0);
  });

  it('impede o fechamento quando o produto saiu do catálogo', async () => {
    carrinhoNoBanco([{ quantidade: 1, produto: produto({ ativo: false }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos.join(' ')).toMatch(/saiu do catálogo/i);
    // E o item não entra na conta: cobrar por ele seria pior do que recusar.
    expect(carrinho.subtotal).toBe(0);
  });

  it('impede quando acabou o estoque de quem faz contagem', async () => {
    carrinhoNoBanco([{ quantidade: 1, produto: produto({ estoque: 0 }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos.join(' ')).toMatch(/sem estoque/i);
  });

  it('NÃO impede quando a loja simplesmente não faz contagem', async () => {
    // O caso do levantamento de campo: 175 itens na prateleira, zero contagens.
    carrinhoNoBanco([{ quantidade: 3, produto: produto({ controla_estoque: false, estoque: 0 }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos).toHaveLength(0);
    expect(carrinho.itens[0].quantidade_disponivel).toBe(3);
    expect(carrinho.subtotal).toBe(589.5);
  });

  it('ajusta a quantidade para o que a loja tem e AVISA, sem impedir', async () => {
    carrinhoNoBanco([{ quantidade: 5, produto: produto({ estoque: 2 }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos).toHaveLength(0);
    expect(carrinho.alertas.join(' ')).toMatch(/só tem 2/i);
    expect(carrinho.itens[0].quantidade_disponivel).toBe(2);
    expect(carrinho.subtotal).toBe(393);
  });

  it('avisa o prazo do item sob encomenda antes de a pessoa pagar', async () => {
    carrinhoNoBanco([
      { quantidade: 1, produto: produto({ sob_encomenda: true, prazo_reposicao_dias: 7, estoque: 0 }) }
    ]);

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos).toHaveLength(0);
    expect(carrinho.alertas.join(' ')).toMatch(/sob encomenda/i);
    expect(carrinho.prazo_encomenda_dias).toBe(7);
  });

  it('impede quando a loja saiu do ar', async () => {
    carrinhoNoBanco([{ quantidade: 1, produto: produto() }], { ...LOJA, status: 'suspensa' });

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos.join(' ')).toMatch(/não está aceitando pedidos/i);
  });

  it('impede quando o carrinho não alcança o pedido mínimo da loja', async () => {
    carrinhoNoBanco([{ quantidade: 1, produto: produto({ preco: 18 }) }], { ...LOJA, pedido_minimo: 50 });

    const carrinho = await verCarrinho(CONTEXTO);

    expect(carrinho.impedimentos.join(' ')).toMatch(/a partir de/i);
  });

  it('marca o carrinho que carrega item sob prescrição', async () => {
    carrinhoNoBanco([{ quantidade: 1, produto: produto({ exige_receita: true }) }]);

    const carrinho = await verCarrinho(CONTEXTO);

    // A loja precisa ver isso na fila para conferir a receita antes de separar.
    expect(carrinho.exige_receita).toBe(true);
  });
});

describe('Adicionar ao carrinho', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.carrinhoMercado.upsert.mockResolvedValue({ id: 'carrinho-1' });
    prisma.itemCarrinhoMercado.upsert.mockResolvedValue({});
    carrinhoNoBanco([{ quantidade: 1, produto: produto() }]);
  });

  it('soma ao que já estava lá, respeitando o estoque como teto', async () => {
    prisma.produtoMercado.findFirst.mockResolvedValue({
      id: 'produto-1',
      loja_id: 'loja-1',
      nome: 'Golden',
      estoque: 3,
      controla_estoque: true,
      sob_encomenda: false
    });
    prisma.itemCarrinhoMercado.findUnique.mockResolvedValue({ quantidade: 2 });

    await adicionarItem({ ...CONTEXTO, produtoId: 'produto-1', quantidade: 5 });

    // Pedir mais do que existe não vira erro: vira o máximo possível, e a
    // leitura do carrinho avisa que ajustamos.
    expect(prisma.itemCarrinhoMercado.upsert.mock.calls[0][0].update).toEqual({ quantidade: 3 });
  });

  it('sem contagem, o teto é o do carrinho e não a coluna zerada', async () => {
    prisma.produtoMercado.findFirst.mockResolvedValue({
      id: 'produto-1',
      loja_id: 'loja-1',
      nome: 'Areia sanitária',
      estoque: 0,
      controla_estoque: false,
      sob_encomenda: false
    });
    prisma.itemCarrinhoMercado.findUnique.mockResolvedValue(null);

    await adicionarItem({ ...CONTEXTO, produtoId: 'produto-1', quantidade: 4 });

    expect(prisma.itemCarrinhoMercado.upsert.mock.calls[0][0].create).toMatchObject({ quantidade: 4 });
  });

  it('recusa produto de loja que não está aprovada', async () => {
    // O filtro está na consulta: `loja: { status: 'aprovada' }`. Sem produto,
    // não há o que adicionar.
    prisma.produtoMercado.findFirst.mockResolvedValue(null);

    await expect(
      adicionarItem({ ...CONTEXTO, produtoId: 'produto-1', quantidade: 1 })
    ).rejects.toThrow(/não encontrado ou indisponível/i);
  });

  it('recusa quantidade fora da faixa de sanidade', async () => {
    await expect(
      adicionarItem({ ...CONTEXTO, produtoId: 'produto-1', quantidade: 500 })
    ).rejects.toThrow(/entre 1 e 99/i);

    await expect(
      adicionarItem({ ...CONTEXTO, produtoId: 'produto-1', quantidade: 0 })
    ).rejects.toThrow(/entre 1 e 99/i);
  });
});
