/**
 * Assinatura de ração com entrega programada.
 *
 * O que precisa ser verdade:
 * 1. A frequência sugerida sai do porte e do peso do saco, e o tutor manda.
 * 2. Assinar congela a política da loja (desconto, frete grátis) e recusa o
 *    que não dá para prometer todo mês: loja sem assinatura, duas lojas,
 *    produto com receita, transportadora.
 * 3. O ciclo gera o pedido pelo MESMO fechamento da compra avulsa, com
 *    desconto, frete zerado na entrega da loja e prazo maior para pagar.
 * 4. Falha de ciclo adia um dia; três vencimentos seguidos pausam.
 */
const prisma = require('../../../src/config/database');

jest.mock('../../../src/services/mercado/carrinho.service', () => ({
  verCarrinho: jest.fn(),
  adicionarItem: jest.fn()
}));
jest.mock('../../../src/services/mercado/entrega.service', () => ({
  cotarEntregaDaLoja: jest.fn()
}));
jest.mock('../../../src/services/mercado/notificacao-mercado.service', () => ({
  avisarCicloDaAssinatura: jest.fn().mockResolvedValue({ avisou: true }),
  avisarAssinaturaPausada: jest.fn().mockResolvedValue({ avisou: true }),
  avisarMudancaDeStatus: jest.fn().mockResolvedValue({ avisou: true })
}));
jest.mock('../../../src/services/mercado/loja.service', () => ({
  comissaoDaLoja: jest.fn().mockResolvedValue(15)
}));

const { adicionarItem, verCarrinho } = require('../../../src/services/mercado/carrinho.service');
const { cotarEntregaDaLoja } = require('../../../src/services/mercado/entrega.service');
const { avisarAssinaturaPausada } = require('../../../src/services/mercado/notificacao-mercado.service');
const {
  criarAssinatura,
  frequenciaSugerida,
  gerarCiclo,
  registrarCicloPerdido,
  registrarCicloPago,
  alterarAssinatura,
  retomarAssinatura,
  HORAS_PARA_PAGAR_O_CICLO
} = require('../../../src/services/mercado/assinatura.service');
const { fecharPedido } = require('../../../src/services/mercado/pedido.service');

const LOJA = {
  id: 'loja-1',
  cidade: 'Ribeirão Preto',
  aceita_assinatura: true,
  assinatura_desconto_pct: 8,
  assinatura_frete_gratis: true,
  aceita_retirada: true,
  aceita_combinar: true,
  aceita_entrega: true
};

const SACO = {
  id: 'produto-1',
  nome: 'Golden Formula Cães Adultos 15 kg',
  preco: 196.5,
  preco_promocional: null,
  peso_gramas: 15000,
  sob_encomenda: false,
  exige_receita: false,
  loja: LOJA
};

describe('frequência sugerida', () => {
  it('sai do consumo do porte e do peso do saco, dentro de 7..90 dias', () => {
    expect(frequenciaSugerida({ porte: 'grande', pesoGramas: 15000 }).dias).toBe(33);
    expect(frequenciaSugerida({ porte: 'pequeno', pesoGramas: 1000 }).dias).toBe(7);
    expect(frequenciaSugerida({ porte: 'medio', pesoGramas: 15000, quantidade: 3 }).dias).toBe(90);
    expect(frequenciaSugerida({ especie: 'gato', pesoGramas: 3000 }).dias).toBe(50);
  });

  it('sem porte ou sem peso cai em 30 dias, sem inventar conta', () => {
    expect(frequenciaSugerida({ pesoGramas: 15000 })).toEqual({ dias: 30, consumo_diario_gramas: null });
    expect(frequenciaSugerida({ porte: 'grande', pesoGramas: null }).dias).toBe(30);
  });
});

describe('criarAssinatura', () => {
  const base = { tenantId: 'tenant-a', tutorId: 'tutor-1', itens: [{ produto_id: 'produto-1', quantidade: 1 }] };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.produtoMercado.findMany.mockResolvedValue([SACO]);
    prisma.assinaturaMercado.create.mockImplementation(async ({ data }: any) => ({ id: 'ass-1', ...data }));
    prisma.assinaturaMercado.findFirst.mockResolvedValue({ id: 'ass-1', status: 'ativa' });
  });

  it('recusa loja que não vende por assinatura', async () => {
    prisma.produtoMercado.findMany.mockResolvedValue([{ ...SACO, loja: { ...LOJA, aceita_assinatura: false } }]);
    await expect(criarAssinatura({ ...base, gerarPrimeiroCiclo: false })).rejects.toThrow(/não vende por assinatura/);
    expect(prisma.assinaturaMercado.create).not.toHaveBeenCalled();
  });

  it('recusa produtos de duas lojas na mesma assinatura', async () => {
    prisma.produtoMercado.findMany.mockResolvedValue([SACO, { ...SACO, id: 'produto-2', loja: { ...LOJA, id: 'loja-2' } }]);
    await expect(
      criarAssinatura({ ...base, itens: [{ produto_id: 'produto-1' }, { produto_id: 'produto-2' }], gerarPrimeiroCiclo: false })
    ).rejects.toThrow(/uma loja só/i);
  });

  it('recusa produto que exige receita e transportadora', async () => {
    prisma.produtoMercado.findMany.mockResolvedValue([{ ...SACO, exige_receita: true }]);
    await expect(criarAssinatura({ ...base, gerarPrimeiroCiclo: false })).rejects.toThrow(/receita/);

    prisma.produtoMercado.findMany.mockResolvedValue([SACO]);
    await expect(criarAssinatura({ ...base, entregaTipo: 'transportadora', gerarPrimeiroCiclo: false })).rejects.toThrow(/retirada, combinada/);
  });

  it('congela desconto e frete grátis da loja e sugere a frequência pelo pet', async () => {
    prisma.pet.findFirst.mockResolvedValue({ id: 'pet-1', porte: 'grande', tipo: 'cachorro', especie: 'cachorro' });
    const { assinatura, pedido } = await criarAssinatura({ ...base, petId: 'pet-1', gerarPrimeiroCiclo: false });
    expect(pedido).toBeNull();
    const dados = prisma.assinaturaMercado.create.mock.calls[0][0].data;
    expect(dados).toMatchObject({ desconto_pct: 8, frete_gratis: true, frequencia_dias: 33, pet_id: 'pet-1', entrega_tipo: 'retirada' });
    expect(dados.itens.create).toEqual([{ produto_id: 'produto-1', quantidade: 1 }]);
    expect(assinatura.id).toBe('ass-1');
  });

  it('pet de outro tutor não pendura assinatura', async () => {
    prisma.pet.findFirst.mockResolvedValue(null);
    await expect(criarAssinatura({ ...base, petId: 'pet-alheio', gerarPrimeiroCiclo: false })).rejects.toThrow(/Pet não encontrado/);
    expect(prisma.pet.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tutor_id: 'tutor-1' }) }));
  });

  it('entrega pela loja exige endereço no raio', async () => {
    cotarEntregaDaLoja.mockResolvedValue({ disponivel: false, motivo: 'Fora do raio de 5 km.' });
    await expect(
      criarAssinatura({
        ...base,
        entregaTipo: 'loja',
        endereco: { endereco: 'Rua das Flores, 100', latitude: -21.1, longitude: -47.8 },
        gerarPrimeiroCiclo: false
      })
    ).rejects.toThrow(/Fora do raio/);
  });
});

describe('gerarCiclo', () => {
  const ASSINATURA = {
    id: 'ass-1',
    tenant_id: 'tenant-a',
    tutor_id: 'tutor-1',
    loja_id: 'loja-1',
    status: 'ativa',
    frequencia_dias: 30,
    proximo_ciclo_em: new Date(),
    entrega_tipo: 'loja',
    entrega_endereco: 'Rua das Flores, 100',
    entrega_cep: null,
    entrega_numero: null,
    entrega_complemento: null,
    entrega_cidade: 'Ribeirão Preto',
    entrega_latitude: -21.1,
    entrega_longitude: -47.8,
    desconto_pct: 8,
    frete_gratis: true,
    ciclos_gerados: 2,
    itens: [{ produto_id: 'produto-1', quantidade: 1 }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.assinaturaMercado.findUnique.mockResolvedValue(ASSINATURA);
    prisma.assinaturaMercado.update.mockResolvedValue({});
    adicionarItem.mockResolvedValue({});
    // O fechamento real, com carrinho e loja simulados.
    verCarrinho.mockResolvedValue({
      id: 'carrinho-1',
      loja: { ...LOJA, cidade: 'Ribeirão Preto' },
      itens: [
        {
          produto_id: 'produto-1', nome: SACO.nome, variacao: null, unidade: 'saco', preco: 196.5,
          quantidade_disponivel: 1, subtotal: 196.5, exige_receita: false, sob_encomenda: false,
          prazo_reposicao_dias: null, peso_gramas: 15000
        }
      ],
      subtotal: 196.5,
      exige_receita: false,
      impedimentos: []
    });
    prisma.lojaMercado.findFirst.mockResolvedValue({ id: 'loja-1', comissao_pct: 15 });
    cotarEntregaDaLoja.mockResolvedValue({ disponivel: true, frete: 12, distancia_km: 3.2 });
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.produtoMercado.findMany.mockResolvedValue([{ id: 'produto-1', nome: SACO.nome, ativo: true, controla_estoque: true, sob_encomenda: false }]);
    prisma.produtoMercado.updateMany.mockResolvedValue({ count: 1 });
    prisma.pedidoMercado.create.mockImplementation(async ({ data }: any) => ({ id: 'pedido-9', codigo: 'MER-ABC123', ...data }));
    prisma.eventoPedidoMercado.create.mockResolvedValue({});
    prisma.carrinhoMercado.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('monta o carrinho, fecha com desconto, frete grátis e 24 h para pagar, e reprograma', async () => {
    const resultado = await gerarCiclo({ assinaturaId: 'ass-1', origem: 'worker' });
    expect(resultado.gerado).toBe(true);

    expect(prisma.carrinhoMercado.deleteMany).toHaveBeenCalledWith({
      where: { tenant_id: 'tenant-a', tutor_id: 'tutor-1', loja_id: 'loja-1' }
    });
    expect(adicionarItem).toHaveBeenCalledWith(expect.objectContaining({ produtoId: 'produto-1', quantidade: 1 }));

    const pedido = prisma.pedidoMercado.create.mock.calls[0][0].data;
    expect(pedido.assinatura_id).toBe('ass-1');
    expect(pedido.desconto).toBe(15.72); // 8% de 196,50
    expect(pedido.frete).toBe(0); // a loja prometeu frete grátis ao assinante
    expect(pedido.total).toBe(180.78);
    expect(pedido.comissao_valor).toBe(27.12); // 15% sobre 180,78, não sobre 196,50
    expect(pedido.repasse_loja).toBe(153.66);
    const horas = (pedido.expira_em.getTime() - Date.now()) / 3_600_000;
    expect(horas).toBeGreaterThan(HORAS_PARA_PAGAR_O_CICLO - 0.1);

    const atualizacao = prisma.assinaturaMercado.update.mock.calls[0][0].data;
    expect(atualizacao.ultimo_pedido_id).toBe('pedido-9');
    expect(atualizacao.ciclos_gerados).toEqual({ increment: 1 });
    const dias = (atualizacao.proximo_ciclo_em.getTime() - Date.now()) / 86_400_000;
    expect(Math.round(dias)).toBe(30);
  });

  it('compra avulsa continua sem desconto e com o prazo curto', async () => {
    await fecharPedido({ tenantId: 'tenant-a', tutorId: 'tutor-1', lojaId: 'loja-1', entregaTipo: 'retirada' });
    const pedido = prisma.pedidoMercado.create.mock.calls[0][0].data;
    expect(pedido.desconto).toBe(0);
    expect(pedido.assinatura_id).toBeNull();
    expect((pedido.expira_em.getTime() - Date.now()) / 60_000).toBeLessThanOrEqual(60);
  });

  it('quando o fechamento falha, adia um dia, guarda o motivo e não derruba o worker', async () => {
    prisma.produtoMercado.updateMany.mockResolvedValue({ count: 0 });
    const resultado = await gerarCiclo({ assinaturaId: 'ass-1', origem: 'worker' });
    expect(resultado.gerado).toBe(false);
    expect(resultado.motivo).toMatch(/sair de estoque/);
    const atualizacao = prisma.assinaturaMercado.update.mock.calls[0][0].data;
    expect(atualizacao.ultimo_erro).toMatch(/sair de estoque/);
    expect(Math.round((atualizacao.proximo_ciclo_em.getTime() - Date.now()) / 86_400_000)).toBe(1);
  });

  it('pausada ou cancelada não gera', async () => {
    prisma.assinaturaMercado.findUnique.mockResolvedValue({ ...ASSINATURA, status: 'pausada' });
    await expect(gerarCiclo({ assinaturaId: 'ass-1', origem: 'worker' })).rejects.toThrow(/pausada/);
    expect(prisma.pedidoMercado.create).not.toHaveBeenCalled();
  });
});

describe('ciclos pagos e perdidos', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.assinaturaMercado.update.mockResolvedValue({});
    prisma.assinaturaMercado.updateMany.mockResolvedValue({ count: 1 });
  });

  it('pagamento zera a contagem de perdidos', async () => {
    await registrarCicloPago(prisma, 'ass-1');
    expect(prisma.assinaturaMercado.updateMany).toHaveBeenCalledWith({
      where: { id: 'ass-1' },
      data: { ciclos_pagos: { increment: 1 }, ciclos_perdidos_seguidos: 0 }
    });
  });

  it('o terceiro vencimento seguido pausa e avisa; o segundo só conta', async () => {
    prisma.assinaturaMercado.findUnique.mockResolvedValue({ id: 'ass-1', status: 'ativa', ciclos_perdidos_seguidos: 1 });
    expect(await registrarCicloPerdido(prisma, 'ass-1')).toEqual({ pausou: false });
    expect(prisma.assinaturaMercado.update.mock.calls[0][0].data).toEqual({ ciclos_perdidos_seguidos: 2 });
    expect(avisarAssinaturaPausada).not.toHaveBeenCalled();

    prisma.assinaturaMercado.findUnique.mockResolvedValue({ id: 'ass-1', status: 'ativa', ciclos_perdidos_seguidos: 2 });
    expect(await registrarCicloPerdido(prisma, 'ass-1')).toEqual({ pausou: true });
    expect(prisma.assinaturaMercado.update.mock.calls[1][0].data).toMatchObject({ status: 'pausada', ciclos_perdidos_seguidos: 3 });
    expect(avisarAssinaturaPausada).toHaveBeenCalledWith('ass-1');
  });
});

describe('gestão pelo tutor', () => {
  const chaves = { tenantId: 'tenant-a', tutorId: 'tutor-1', assinaturaId: 'ass-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    prisma.assinaturaMercado.update.mockResolvedValue({});
    prisma.$transaction.mockImplementation(async (fn: any) => fn(prisma));
    prisma.itemAssinaturaMercado.updateMany.mockResolvedValue({ count: 1 });
  });

  it('mudar a frequência reprograma a partir do último ciclo, nunca para o passado', async () => {
    const proximo = new Date(Date.now() + 10 * 86_400_000); // último ciclo há 20 dias, freq 30
    prisma.assinaturaMercado.findFirst
      .mockResolvedValueOnce({ id: 'ass-1', status: 'ativa', frequencia_dias: 30, proximo_ciclo_em: proximo })
      .mockResolvedValueOnce({ id: 'ass-1', status: 'ativa' });
    await alterarAssinatura({ ...chaves, frequenciaDias: 25, quantidades: [{ produto_id: 'produto-1', quantidade: 2 }] });
    const dados = prisma.assinaturaMercado.update.mock.calls[0][0].data;
    expect(dados.frequencia_dias).toBe(25);
    expect(Math.round((dados.proximo_ciclo_em.getTime() - Date.now()) / 86_400_000)).toBe(5);
    expect(prisma.itemAssinaturaMercado.updateMany).toHaveBeenCalledWith({
      where: { assinatura_id: 'ass-1', produto_id: 'produto-1' },
      data: { quantidade: 2 }
    });
  });

  it('frequência fora de 7..90 é recusada', async () => {
    prisma.assinaturaMercado.findFirst.mockResolvedValue({ id: 'ass-1', status: 'ativa', frequencia_dias: 30, proximo_ciclo_em: new Date() });
    await expect(alterarAssinatura({ ...chaves, frequenciaDias: 3 })).rejects.toThrow(/entre 7 e 90/);
  });

  it('retomar uma assinatura pausada zera perdidos e marca o próximo ciclo para daqui a um período', async () => {
    prisma.assinaturaMercado.findFirst
      .mockResolvedValueOnce({ id: 'ass-1', status: 'pausada', frequencia_dias: 30, proximo_ciclo_em: new Date(0) })
      .mockResolvedValueOnce({ id: 'ass-1', status: 'ativa' });
    await retomarAssinatura(chaves);
    const dados = prisma.assinaturaMercado.update.mock.calls[0][0].data;
    expect(dados).toMatchObject({ status: 'ativa', ciclos_perdidos_seguidos: 0 });
    expect(Math.round((dados.proximo_ciclo_em.getTime() - Date.now()) / 86_400_000)).toBe(30);
  });

  it('cancelada não volta', async () => {
    prisma.assinaturaMercado.findFirst.mockResolvedValue({ id: 'ass-1', status: 'cancelada', frequencia_dias: 30, proximo_ciclo_em: new Date() });
    await expect(retomarAssinatura(chaves)).rejects.toThrow(/não volta/);
  });
});
