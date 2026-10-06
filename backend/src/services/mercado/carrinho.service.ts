import prisma from '../../config/database';
import { NotFoundError, ValidationError } from '../../middleware/error.middleware';
import { DISPONIVEL, LOJA_PUBLICA, estaDisponivel, limiteDoItem, precoVigente } from './comum';

/**
 * Carrinho do Saúde Pet Mercado.
 *
 * Duas decisões moram aqui, e as duas existem para a tela nunca mentir:
 *
 * 1. **Um carrinho por loja.** Cada loja separa e entrega o que é dela. Um
 *    carrinho único com itens de três vendedores viraria três pedidos, três
 *    prazos e três repasses escondidos atrás de um botão só de "finalizar".
 *
 * 2. **O carrinho guarda quantidade, não preço.** Congelar o preço faria o
 *    tutor pagar um valor que a loja já mudou; ler sempre o preço vigente e
 *    AVISAR o que mudou desde a última visita é o meio-termo honesto. Por isso
 *    a leitura devolve `alertas` e `impedimentos` em vez de corrigir em
 *    silêncio.
 */

/** Ninguém compra 400 sacos de ração por engano — e quem compra, fala com a loja. */
const QUANTIDADE_MAXIMA = 99;

type ItemLido = {
  id: string;
  produto_id: string;
  quantidade: number;
  nome: string;
  slug: string;
  marca: string | null;
  variacao: string | null;
  tamanho: string | null;
  imagem_url: string | null;
  unidade: string;
  granel: boolean;
  preco: number;
  preco_cheio: number;
  em_promocao: boolean;
  exige_receita: boolean;
  sob_encomenda: boolean;
  prazo_reposicao_dias: number | null;
  peso_gramas: number | null;
  disponivel: boolean;
  /** Quanto dá para levar de verdade agora. */
  quantidade_disponivel: number;
  subtotal: number;
};

export type CarrinhoLido = {
  id: string;
  loja: {
    id: string;
    nome_fantasia: string;
    slug: string;
    endereco: string;
    bairro: string | null;
    cidade: string;
    estado: string;
    prazo_preparo_min: number;
    pedido_minimo: number;
    aceita_retirada: boolean;
    aceita_combinar: boolean;
    aceita_entrega: boolean;
    aceita_transportadora: boolean;
    entrega_raio_km: number | null;
    frete_gratis_acima: number | null;
    entrega_prazo_horas: number | null;
    cep: string | null;
    embalagem_altura_cm: number | null;
    embalagem_largura_cm: number | null;
    embalagem_comprimento_cm: number | null;
    status: string;
  };
  itens: ItemLido[];
  subtotal: number;
  total_itens: number;
  exige_receita: boolean;
  /** Maior prazo de encomenda no carrinho, em dias. Nulo quando tudo está na loja. */
  prazo_encomenda_dias: number | null;
  /** O que impede o fechamento. Vazio significa "dá para pagar". */
  impedimentos: string[];
  /** O que mudou desde a última visita, sem impedir o fechamento. */
  alertas: string[];
};

const SELECAO_CARRINHO = {
  id: true,
  loja: {
    select: {
      id: true,
      nome_fantasia: true,
      slug: true,
      endereco: true,
      bairro: true,
      cidade: true,
      estado: true,
      prazo_preparo_min: true,
      pedido_minimo: true,
      aceita_retirada: true,
      aceita_combinar: true,
      aceita_entrega: true,
      aceita_transportadora: true,
      entrega_raio_km: true,
      frete_gratis_acima: true,
      entrega_prazo_horas: true,
      cep: true,
      embalagem_altura_cm: true,
      embalagem_largura_cm: true,
      embalagem_comprimento_cm: true,
      status: true
    }
  },
  itens: {
    select: {
      id: true,
      quantidade: true,
      produto: {
        select: {
          id: true,
          nome: true,
          slug: true,
          marca: true,
          variacao: true,
          tamanho: true,
          imagem_url: true,
          unidade: true,
          granel: true,
          preco: true,
          preco_promocional: true,
          estoque: true,
          controla_estoque: true,
          sob_encomenda: true,
          prazo_reposicao_dias: true,
          exige_receita: true,
          peso_gramas: true,
          ativo: true
        }
      }
    },
    orderBy: { criado_em: 'asc' as const }
  }
} as const;

type ProdutoNoCarrinho = {
  id: string;
  nome: string;
  slug: string;
  marca: string | null;
  variacao: string | null;
  tamanho: string | null;
  imagem_url: string | null;
  unidade: string;
  granel: boolean;
  preco: unknown;
  preco_promocional: unknown;
  estoque: number;
  controla_estoque: boolean;
  sob_encomenda: boolean;
  prazo_reposicao_dias: number | null;
  exige_receita: boolean;
  peso_gramas: number | null;
  ativo: boolean;
};

type CarrinhoBruto = {
  id: string;
  loja: Omit<
    CarrinhoLido['loja'],
    'pedido_minimo' | 'aceita_entrega' | 'aceita_transportadora' | 'entrega_raio_km' | 'frete_gratis_acima' | 'entrega_prazo_horas' | 'embalagem_altura_cm' | 'embalagem_largura_cm' | 'embalagem_comprimento_cm'
  > & {
    pedido_minimo: unknown;
    aceita_entrega?: unknown;
    aceita_transportadora?: unknown;
    entrega_raio_km?: unknown;
    frete_gratis_acima?: unknown;
    entrega_prazo_horas?: unknown;
    embalagem_altura_cm?: unknown;
    embalagem_largura_cm?: unknown;
    embalagem_comprimento_cm?: unknown;
  };
  itens: Array<{ id: string; quantidade: number; produto: ProdutoNoCarrinho }>;
};

/**
 * Transforma o carrinho guardado no carrinho de agora.
 *
 * O que muda entre uma visita e outra: preço, estoque, produto desativado, loja
 * suspensa. Nada disso pode aparecer só no momento do pagamento.
 */
function montar(carrinho: CarrinhoBruto): CarrinhoLido {
  const impedimentos: string[] = [];
  const alertas: string[] = [];

  const itens: ItemLido[] = carrinho.itens.map((item) => {
    const produto = item.produto;
    const preco = precoVigente(produto);
    const cheio = Math.round(Number(produto.preco) * 100) / 100;
    const disponivel = estaDisponivel(produto);
    const teto = limiteDoItem(produto, QUANTIDADE_MAXIMA);
    const quantidadeDisponivel = disponivel ? Math.min(item.quantidade, teto) : 0;

    if (!produto.ativo) {
      impedimentos.push(`"${produto.nome}" saiu do catálogo da loja.`);
    } else if (!disponivel) {
      impedimentos.push(`"${produto.nome}" está sem estoque.`);
    } else if (quantidadeDisponivel < item.quantidade) {
      alertas.push(`A loja só tem ${quantidadeDisponivel} de "${produto.nome}" — ajustamos a quantidade.`);
    }

    if (produto.sob_encomenda && produto.prazo_reposicao_dias) {
      alertas.push(
        `"${produto.nome}" é sob encomenda: a loja busca em até ${produto.prazo_reposicao_dias} dia(s).`
      );
    }

    return {
      id: item.id,
      produto_id: produto.id,
      quantidade: item.quantidade,
      nome: produto.nome,
      slug: produto.slug,
      marca: produto.marca,
      variacao: produto.variacao,
      tamanho: produto.tamanho,
      imagem_url: produto.imagem_url,
      unidade: produto.unidade,
      granel: produto.granel,
      preco,
      preco_cheio: cheio,
      em_promocao: preco < cheio,
      exige_receita: produto.exige_receita,
      sob_encomenda: produto.sob_encomenda,
      prazo_reposicao_dias: produto.prazo_reposicao_dias,
      peso_gramas: produto.peso_gramas,
      disponivel,
      quantidade_disponivel: quantidadeDisponivel,
      subtotal: Math.round(preco * quantidadeDisponivel * 100) / 100
    };
  });

  const subtotal = Math.round(itens.reduce((soma, item) => soma + item.subtotal, 0) * 100) / 100;
  const pedidoMinimo = Math.round(Number(carrinho.loja.pedido_minimo || 0) * 100) / 100;
  const numeroOuNulo = (valor: unknown): number | null => {
    if (valor === null || valor === undefined || valor === '') return null;
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  };

  if (carrinho.loja.status !== 'aprovada') {
    impedimentos.push('Esta loja não está aceitando pedidos no momento.');
  }
  if (itens.length === 0) {
    impedimentos.push('O carrinho está vazio.');
  }
  if (subtotal > 0 && pedidoMinimo > 0 && subtotal < pedidoMinimo) {
    impedimentos.push(
      `Esta loja atende a partir de ${pedidoMinimo.toLocaleString('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      })}.`
    );
  }

  const prazos = itens
    .filter((item) => item.sob_encomenda && item.quantidade_disponivel > 0 && item.prazo_reposicao_dias)
    .map((item) => Number(item.prazo_reposicao_dias));

  return {
    id: carrinho.id,
    loja: {
      ...carrinho.loja,
      pedido_minimo: pedidoMinimo,
      aceita_entrega: Boolean(carrinho.loja.aceita_entrega),
      aceita_transportadora: Boolean(carrinho.loja.aceita_transportadora),
      entrega_raio_km: numeroOuNulo(carrinho.loja.entrega_raio_km),
      frete_gratis_acima: numeroOuNulo(carrinho.loja.frete_gratis_acima),
      entrega_prazo_horas: numeroOuNulo(carrinho.loja.entrega_prazo_horas),
      embalagem_altura_cm: numeroOuNulo(carrinho.loja.embalagem_altura_cm),
      embalagem_largura_cm: numeroOuNulo(carrinho.loja.embalagem_largura_cm),
      embalagem_comprimento_cm: numeroOuNulo(carrinho.loja.embalagem_comprimento_cm)
    },
    itens,
    subtotal,
    total_itens: itens.reduce((soma, item) => soma + item.quantidade_disponivel, 0),
    exige_receita: itens.some((item) => item.exige_receita && item.quantidade_disponivel > 0),
    prazo_encomenda_dias: prazos.length > 0 ? Math.max(...prazos) : null,
    impedimentos,
    alertas
  };
}

/** Todos os carrinhos abertos do tutor, um por loja. */
export async function listarCarrinhos(tenantId: string, tutorId: string): Promise<CarrinhoLido[]> {
  const carrinhos = await prisma.carrinhoMercado.findMany({
    where: { tenant_id: tenantId, tutor_id: tutorId },
    select: SELECAO_CARRINHO,
    orderBy: { atualizado_em: 'desc' }
  });

  // Carrinho que ficou sem item nenhum é lixo de navegação: some da lista em
  // vez de virar um cartão vazio que a pessoa precisa fechar na mão.
  return (carrinhos as unknown as CarrinhoBruto[])
    .filter((carrinho) => carrinho.itens.length > 0)
    .map(montar);
}

export async function verCarrinho(params: {
  tenantId: string;
  tutorId: string;
  lojaId: string;
}): Promise<CarrinhoLido | null> {
  const carrinho = await prisma.carrinhoMercado.findFirst({
    where: { tenant_id: params.tenantId, tutor_id: params.tutorId, loja_id: params.lojaId },
    select: SELECAO_CARRINHO
  });
  if (!carrinho) return null;
  return montar(carrinho as unknown as CarrinhoBruto);
}

export async function adicionarItem(params: {
  tenantId: string;
  tutorId: string;
  produtoId: string;
  quantidade?: number;
}): Promise<CarrinhoLido> {
  const quantidade = Math.trunc(Number(params.quantidade ?? 1));
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA) {
    throw new ValidationError(`Escolha uma quantidade entre 1 e ${QUANTIDADE_MAXIMA}.`);
  }

  const produto = await prisma.produtoMercado.findFirst({
    where: {
      id: params.produtoId,
      tenant_id: params.tenantId,
      ativo: true,
      loja: LOJA_PUBLICA,
      ...DISPONIVEL
    },
    select: {
      id: true,
      loja_id: true,
      nome: true,
      estoque: true,
      controla_estoque: true,
      sob_encomenda: true
    }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado ou indisponível.');

  const carrinho = await prisma.carrinhoMercado.upsert({
    where: { tutor_id_loja_id: { tutor_id: params.tutorId, loja_id: produto.loja_id } },
    update: { atualizado_em: new Date() },
    create: { tenant_id: params.tenantId, tutor_id: params.tutorId, loja_id: produto.loja_id },
    select: { id: true }
  });

  const jaNoCarrinho = await prisma.itemCarrinhoMercado.findUnique({
    where: { carrinho_id_produto_id: { carrinho_id: carrinho.id, produto_id: produto.id } },
    select: { quantidade: true }
  });

  // Somar ao que já estava lá é o que a pessoa espera de "adicionar". O teto é
  // o que a loja tem: pedir mais do que existe não vira erro, vira o máximo
  // possível — e a leitura do carrinho avisa que ajustamos.
  const desejada = (jaNoCarrinho?.quantidade || 0) + quantidade;
  const final = Math.max(1, Math.min(desejada, limiteDoItem(produto, QUANTIDADE_MAXIMA)));

  await prisma.itemCarrinhoMercado.upsert({
    where: { carrinho_id_produto_id: { carrinho_id: carrinho.id, produto_id: produto.id } },
    update: { quantidade: final },
    create: { carrinho_id: carrinho.id, produto_id: produto.id, quantidade: final }
  });

  const lido = await verCarrinho({
    tenantId: params.tenantId,
    tutorId: params.tutorId,
    lojaId: produto.loja_id
  });
  if (!lido) throw new NotFoundError('Carrinho não encontrado.');
  return lido;
}

export async function alterarQuantidade(params: {
  tenantId: string;
  tutorId: string;
  produtoId: string;
  quantidade: number;
}): Promise<CarrinhoLido | null> {
  const quantidade = Math.trunc(Number(params.quantidade));
  if (!Number.isInteger(quantidade) || quantidade < 0 || quantidade > QUANTIDADE_MAXIMA) {
    throw new ValidationError(`Escolha uma quantidade entre 0 e ${QUANTIDADE_MAXIMA}.`);
  }

  // O filtro pelo tutor é o que impede alguém de mexer no carrinho de outra
  // pessoa só tendo o id do produto.
  const item = await prisma.itemCarrinhoMercado.findFirst({
    where: {
      produto_id: params.produtoId,
      carrinho: { tenant_id: params.tenantId, tutor_id: params.tutorId }
    },
    select: {
      id: true,
      carrinho: { select: { loja_id: true } },
      produto: {
        select: { nome: true, estoque: true, controla_estoque: true, sob_encomenda: true }
      }
    }
  });
  if (!item) throw new NotFoundError('Item não encontrado no carrinho.');

  if (quantidade === 0) {
    await prisma.itemCarrinhoMercado.delete({ where: { id: item.id } });
  } else {
    const teto = limiteDoItem(item.produto, QUANTIDADE_MAXIMA);
    if (quantidade > teto) {
      throw new ValidationError(`A loja tem ${teto} de "${item.produto.nome}" no momento.`);
    }
    await prisma.itemCarrinhoMercado.update({ where: { id: item.id }, data: { quantidade } });
  }

  return verCarrinho({ tenantId: params.tenantId, tutorId: params.tutorId, lojaId: item.carrinho.loja_id });
}

export async function esvaziarCarrinho(params: { tenantId: string; tutorId: string; lojaId: string }) {
  const carrinho = await prisma.carrinhoMercado.findFirst({
    where: { tenant_id: params.tenantId, tutor_id: params.tutorId, loja_id: params.lojaId },
    select: { id: true }
  });
  if (!carrinho) throw new NotFoundError('Carrinho não encontrado.');

  await prisma.carrinhoMercado.delete({ where: { id: carrinho.id } });
  return { removido: true };
}

/** Quantos itens o tutor tem em aberto, para o selo da vitrine. */
export async function contarItens(tenantId: string, tutorId: string): Promise<number> {
  const agregado = await prisma.itemCarrinhoMercado.aggregate({
    where: { carrinho: { tenant_id: tenantId, tutor_id: tutorId } },
    _sum: { quantidade: true }
  });
  return Number(agregado._sum.quantidade || 0);
}

export { QUANTIDADE_MAXIMA };
