/**
 * Entrega pela loja — o frete que a tela mostra é o frete que o pedido cobra.
 *
 * Duas coisas precisam ser verdade:
 *
 * 1. **Fora do raio é recusa, não frete caro.** Ração de quinze quilos a trinta
 *    quilômetros não fecha conta; "entregamos, mas custa R$ 90" é a surpresa
 *    que faz a pessoa não voltar.
 *
 * 2. **A comissão incide sobre os produtos, não sobre o frete.** A moto na rua
 *    é da loja; cobrar comissão sobre gasolina seria cobrar duas vezes.
 */

const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/mercado/carrinho.service', () => ({
  verCarrinho: jest.fn()
}));

const { verCarrinho } = require('../../../src/services/mercado/carrinho.service');
const { cotarFrete } = require('../../../src/services/mercado/comum');
const { cotarEntregaDaLoja } = require('../../../src/services/mercado/entrega.service');
const { fecharPedido } = require('../../../src/services/mercado/pedido.service');

const POLITICA = {
  aceita_entrega: true,
  entrega_raio_km: 8,
  frete_base: 5,
  frete_por_km: 2,
  frete_gratis_acima: 150
};

describe('cotarFrete: a conta do frete', () => {
  it('recusa quando a loja não entrega', () => {
    const cotacao = cotarFrete({ ...POLITICA, aceita_entrega: false }, 2, 100);
    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toMatch(/não entrega/i);
    expect(cotacao.frete).toBe(0);
  });

  it('recusa quando a loja marcou que entrega mas não definiu o raio', () => {
    const cotacao = cotarFrete({ ...POLITICA, entrega_raio_km: null }, 2, 100);
    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toMatch(/área de entrega/i);
  });

  it('recusa quando não há distância — endereço sem coordenada', () => {
    const cotacao = cotarFrete(POLITICA, null, 100);
    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toMatch(/localizar o endereço/i);
  });

  it('fora do raio é recusa com os dois números na frase', () => {
    const cotacao = cotarFrete(POLITICA, 12.37, 100);
    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toContain('8,0 km');
    expect(cotacao.motivo).toContain('12,4 km');
    expect(cotacao.distancia_km).toBe(12.37);
    expect(cotacao.raio_km).toBe(8);
  });

  it('no limite exato do raio ainda entrega', () => {
    expect(cotarFrete(POLITICA, 8, 100).disponivel).toBe(true);
  });

  it('soma a parcela fixa com a parcela por km, em centavos', () => {
    // 5 + 2 × 3,5 = 12,00
    const cotacao = cotarFrete(POLITICA, 3.5, 100);
    expect(cotacao.disponivel).toBe(true);
    expect(cotacao.frete).toBe(12);
    expect(cotacao.frete_gratis).toBe(false);
    // Faltam R$ 50 para o frete zerar — a tela diz isso em vez de esconder.
    expect(cotacao.falta_para_frete_gratis).toBe(50);
  });

  it('zera o frete a partir do piso de frete grátis', () => {
    const cotacao = cotarFrete(POLITICA, 3.5, 150);
    expect(cotacao.frete).toBe(0);
    expect(cotacao.frete_gratis).toBe(true);
    expect(cotacao.falta_para_frete_gratis).toBeNull();
  });

  it('sem piso configurado nunca é grátis, e não inventa "falta X"', () => {
    const cotacao = cotarFrete({ ...POLITICA, frete_gratis_acima: null }, 1, 10000);
    expect(cotacao.frete).toBe(7);
    expect(cotacao.frete_gratis).toBe(false);
    expect(cotacao.falta_para_frete_gratis).toBeNull();
  });

  it('aceita os números como o Prisma devolve (Decimal vira string)', () => {
    const cotacao = cotarFrete(
      { aceita_entrega: true, entrega_raio_km: '8.0', frete_base: '5.00', frete_por_km: '2.00', frete_gratis_acima: '150.00' },
      2,
      100
    );
    expect(cotacao.frete).toBe(9);
  });
});

describe('cotarEntregaDaLoja: a distância real', () => {
  beforeEach(() => jest.clearAllMocks());

  const LOJA = {
    id: 'loja-1',
    status: 'aprovada',
    // Ribeirão Preto, centro.
    latitude: -21.1775,
    longitude: -47.8103,
    ...POLITICA,
    entrega_prazo_horas: 4
  };

  it('recusa quando a loja quer entregar mas não tem coordenada', async () => {
    prisma.lojaMercado.findFirst.mockResolvedValue({ ...LOJA, latitude: null, longitude: null });

    const cotacao = await cotarEntregaDaLoja({
      tenantId: 't',
      lojaId: 'loja-1',
      latitude: -21.18,
      longitude: -47.81,
      subtotal: 100
    });

    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toMatch(/localização dela/i);
  });

  it('mede a distância entre a loja e o endereço e cobra por ela', async () => {
    prisma.lojaMercado.findFirst.mockResolvedValue(LOJA);

    // 0,05° de longitude na latitude de Ribeirão Preto ≈ 5,2 km.
    const cotacao = await cotarEntregaDaLoja({
      tenantId: 't',
      lojaId: 'loja-1',
      latitude: -21.1775,
      longitude: -47.7603,
      subtotal: 100
    });

    expect(cotacao.disponivel).toBe(true);
    expect(cotacao.distancia_km).toBeGreaterThan(4.5);
    expect(cotacao.distancia_km).toBeLessThan(6);
    expect(cotacao.frete).toBeCloseTo(5 + 2 * (cotacao.distancia_km as number), 2);
    expect(cotacao.prazo_horas).toBe(4);
  });

  it('um tutor da cidade vizinha fica fora do raio', async () => {
    prisma.lojaMercado.findFirst.mockResolvedValue(LOJA);

    // Sertãozinho, ~20 km.
    const cotacao = await cotarEntregaDaLoja({
      tenantId: 't',
      lojaId: 'loja-1',
      latitude: -21.1378,
      longitude: -47.9903,
      subtotal: 100
    });

    expect(cotacao.disponivel).toBe(false);
    expect(cotacao.motivo).toMatch(/fora da área/i);
  });
});

describe('fecharPedido com entrega pela loja', () => {
  const LOJA_NO_CARRINHO = {
    id: 'loja-1',
    nome_fantasia: 'Casa de Rações Filhos de 4 Patas',
    slug: 'filhos-de-4-patas',
    cidade: 'Ribeirão Preto',
    estado: 'SP',
    status: 'aprovada',
    prazo_preparo_min: 60,
    pedido_minimo: 0,
    aceita_retirada: true,
    aceita_combinar: true,
    aceita_entrega: true,
    entrega_raio_km: 8,
    frete_gratis_acima: null,
    entrega_prazo_horas: 4
  };

  const carrinho = () => ({
    id: 'carrinho-1',
    loja: LOJA_NO_CARRINHO,
    itens: [
      {
        id: 'item-1',
        produto_id: 'produto-1',
        quantidade: 2,
        quantidade_disponivel: 2,
        nome: 'Golden Formula Cães Adultos 15 kg',
        variacao: null,
        unidade: 'saco',
        granel: false,
        preco: 196.5,
        preco_cheio: 196.5,
        em_promocao: false,
        exige_receita: false,
        sob_encomenda: false,
        prazo_reposicao_dias: null,
        disponivel: true,
        subtotal: 393
      }
    ],
    subtotal: 393,
    total_itens: 2,
    exige_receita: false,
    prazo_encomenda_dias: null,
    impedimentos: [],
    alertas: []
  });

  /** O que o banco devolve para a loja — nas DUAS leituras (fechamento e cotação). */
  const LOJA_NO_BANCO = {
    id: 'loja-1',
    status: 'aprovada',
    comissao_pct: null,
    aceita_entrega: true,
    latitude: -21.1775,
    longitude: -47.8103,
    entrega_raio_km: 8,
    frete_base: 5,
    // Só a parcela fixa, para o teste não depender da casa decimal da distância.
    frete_por_km: 0,
    frete_gratis_acima: null,
    entrega_prazo_horas: 4
  };

  function preparar(loja = LOJA_NO_BANCO) {
    verCarrinho.mockResolvedValue(carrinho());
    prisma.lojaMercado.findFirst.mockResolvedValue(loja);
    prisma.configuracaoTenant.findUnique.mockResolvedValue({ comissao_plataforma_pct: 15 });
    prisma.produtoMercado.findMany.mockResolvedValue([
      { id: 'produto-1', nome: 'Golden', ativo: true, controla_estoque: false, sob_encomenda: false }
    ]);
    prisma.pedidoMercado.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'pedido-1', ...data })
    );
    prisma.eventoPedidoMercado.create.mockResolvedValue({});
    prisma.carrinhoMercado.deleteMany.mockResolvedValue({ count: 1 });
  }

  const ENDERECO_PERTO = {
    endereco: 'Rua Álvares Cabral, 500',
    cidade: 'Ribeirão Preto',
    latitude: -21.18,
    longitude: -47.8
  };

  const BASE = { tenantId: 'tenant-1', tutorId: 'tutor-1', lojaId: 'loja-1' };

  beforeEach(() => jest.clearAllMocks());

  it('soma o frete ao total, mas a comissão sai só dos produtos', async () => {
    preparar();

    const pedido = await fecharPedido({ ...BASE, entregaTipo: 'loja', endereco: ENDERECO_PERTO });

    expect(pedido.entrega_tipo).toBe('loja');
    expect(Number(pedido.frete)).toBe(5);
    expect(Number(pedido.total)).toBe(398);
    // 15% de 393, não de 398.
    expect(Number(pedido.comissao_valor)).toBe(58.95);
    // O frete vai inteiro para a loja: 393 − 58,95 + 5.
    expect(Number(pedido.repasse_loja)).toBe(339.05);
    expect(Number(pedido.comissao_valor) + Number(pedido.repasse_loja)).toBeCloseTo(398, 2);
    // A distância cobrada fica gravada no pedido, para o frete continuar
    // explicável depois que a loja mudar a política.
    expect(Number(pedido.entrega_distancia_km)).toBeGreaterThan(0);
    expect(pedido.entrega_endereco).toBe('Rua Álvares Cabral, 500');
  });

  it('recusa endereço fora do raio ANTES de criar pedido ou cobrança', async () => {
    preparar({ ...LOJA_NO_BANCO, entrega_raio_km: 1 });

    await expect(
      fecharPedido({
        ...BASE,
        entregaTipo: 'loja',
        endereco: { ...ENDERECO_PERTO, latitude: -21.1378, longitude: -47.9903 }
      })
    ).rejects.toThrow(/fora da área/i);

    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });

  it('recusa quando a loja não entrega', async () => {
    preparar({ ...LOJA_NO_BANCO, aceita_entrega: false });
    verCarrinho.mockResolvedValue({ ...carrinho(), loja: { ...LOJA_NO_CARRINHO, aceita_entrega: false } });

    await expect(fecharPedido({ ...BASE, entregaTipo: 'loja', endereco: ENDERECO_PERTO })).rejects.toThrow(
      /não entrega em casa/i
    );
    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });

  it('exige coordenada no endereço — sem ponto não há distância, e sem distância não há frete', async () => {
    preparar();

    await expect(
      fecharPedido({ ...BASE, entregaTipo: 'loja', endereco: { endereco: 'Rua Álvares Cabral, 500' } })
    ).rejects.toThrow(/confirme o endereço/i);
    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });

  it('"combinar" continua sem frete, como sempre foi', async () => {
    preparar();

    const pedido = await fecharPedido({ ...BASE, entregaTipo: 'combinar', endereco: { endereco: 'Rua Álvares Cabral, 500' } });

    expect(Number(pedido.frete)).toBe(0);
    expect(Number(pedido.total)).toBe(393);
    expect(pedido.entrega_distancia_km).toBeNull();
  });

  it('"entregador" continua recusado: não há quem entregue', async () => {
    preparar();

    await expect(fecharPedido({ ...BASE, entregaTipo: 'entregador', endereco: ENDERECO_PERTO })).rejects.toThrow(
      /forma de entrega disponível/i
    );
  });
});
