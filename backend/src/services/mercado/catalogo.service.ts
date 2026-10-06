import prisma from '../../config/database';
import { ConflictError, NotFoundError, ValidationError } from '../../middleware/error.middleware';
import {
  DISPONIVEL,
  ESPECIES,
  estaDisponivel,
  gerarSlug,
  limiteDoItem,
  precoSugerido,
  precoVigente,
  UNIDADES, LOJA_PUBLICA, normalizarImagem } from './comum';
import type { Prisma } from '@prisma/client';

/**
 * Catálogo do Saúde Pet Mercado.
 *
 * Duas leituras diferentes do mesmo dado, e é importante que sejam duas:
 *
 * - **A do lojista**, que vê tudo que é dele — inclusive o produto desativado, o
 *   custo, a margem e a pendência do levantamento. É o que ele precisa corrigir.
 * - **A do tutor**, que só enxerga produto disponível, de loja aprovada, e
 *   NENHUM número da economia da loja. Custo e margem não passam pela seleção
 *   pública — não é questão de a tela não mostrar, é de o dado não sair daqui.
 */

/**
 * O que o tutor pode ver. Repare no que não está aqui: `custo`, `margem_pct`,
 * `fornecedor` e `nota_interna`. Quatro campos que, vazados, entregariam a
 * margem da loja a qualquer pessoa com o aplicativo aberto.
 */
const CAMPOS_PUBLICOS = {
  id: true,
  nome: true,
  slug: true,
  descricao: true,
  marca: true,
  variacao: true,
  tamanho: true,
  preco: true,
  preco_promocional: true,
  unidade: true,
  peso_gramas: true,
  estoque: true,
  controla_estoque: true,
  granel: true,
  sob_encomenda: true,
  prazo_reposicao_dias: true,
  exige_receita: true,
  especie_alvo: true,
  imagem_url: true,
  imagem_alt: true,
  imagens: true,
  categoria: { select: { id: true, nome: true, slug: true } }
} satisfies Prisma.ProdutoMercadoSelect;

const CAMPOS_DO_LOJISTA = {
  ...CAMPOS_PUBLICOS,
  sku: true,
  ean: true,
  custo: true,
  margem_pct: true,
  fornecedor: true,
  nota_interna: true,
  imagem_status: true,
  imagem_tem_etiqueta: true,
  ativo: true,
  categoria_id: true,
  criado_em: true,
  atualizado_em: true
} satisfies Prisma.ProdutoMercadoSelect;

// ── Categorias ────────────────────────────────────────────────────────────────

const SELECAO_CATEGORIA = {
  id: true,
  nome: true,
  slug: true,
  icone: true,
  ordem: true,
  ativo: true,
  // A margem padrão da prateleira é pública para o LOJISTA (é a sugestão de
  // preço dele) e inofensiva para o tutor: não diz quanto a loja paga.
  margem_padrao_pct: true
} satisfies Prisma.CategoriaMercadoSelect;

export async function listarCategorias(tenantId: string) {
  return prisma.categoriaMercado.findMany({
    where: { tenant_id: tenantId, ativo: true },
    select: SELECAO_CATEGORIA,
    orderBy: [{ ordem: 'asc' }, { nome: 'asc' }]
  });
}

/** A equipe vê todas — inclusive a desativada — e quantos produtos cada uma tem. */
export async function listarCategoriasParaAdmin(tenantId: string) {
  const categorias = await prisma.categoriaMercado.findMany({
    where: { tenant_id: tenantId },
    select: { ...SELECAO_CATEGORIA, _count: { select: { produtos: true } } },
    orderBy: [{ ativo: 'desc' }, { ordem: 'asc' }, { nome: 'asc' }]
  });
  return (categorias || []).map(({ _count, ...categoria }) => ({ ...categoria, total_produtos: _count?.produtos ?? 0 }));
}

function margemValida(valor: unknown, rotulo: string): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > 9.9999) {
    throw new ValidationError(`${rotulo} precisa ser um número entre 0 e 9,99 (0,25 = 25%).`);
  }
  return numero;
}

/**
 * Ajuste de uma prateleira: nome, ordem, ativa e — o que motivou isto — a
 * margem padrão. "Ração premium suporta 18–30%; acessório suporta bem mais":
 * o número mora aqui, na configuração, e não no código.
 */
export async function atualizarCategoria(params: {
  tenantId: string;
  categoriaId: string;
  dados: { nome?: unknown; icone?: unknown; ordem?: unknown; ativo?: unknown; margem_padrao_pct?: unknown };
}) {
  const categoria = await prisma.categoriaMercado.findFirst({
    where: { id: params.categoriaId, tenant_id: params.tenantId },
    select: { id: true, nome: true, slug: true }
  });
  if (!categoria) throw new NotFoundError('Categoria não encontrada.');

  const dados: Prisma.CategoriaMercadoUpdateInput = {};

  if (params.dados.nome !== undefined) {
    const nome = String(params.dados.nome || '').trim();
    if (nome.length < 2) throw new ValidationError('Informe o nome da categoria.');
    if (nome !== categoria.nome) {
      const slug = gerarSlug(nome);
      const outra = await prisma.categoriaMercado.findFirst({
        where: { tenant_id: params.tenantId, slug, id: { not: categoria.id } },
        select: { id: true }
      });
      if (outra) throw new ConflictError('Já existe uma categoria com este nome.');
      dados.nome = nome;
      dados.slug = slug;
    }
  }
  if (params.dados.icone !== undefined) dados.icone = params.dados.icone ? String(params.dados.icone) : null;
  if (params.dados.ordem !== undefined) dados.ordem = Number(params.dados.ordem) || 0;
  if (params.dados.ativo !== undefined) dados.ativo = Boolean(params.dados.ativo);
  if (params.dados.margem_padrao_pct !== undefined) {
    dados.margem_padrao_pct = margemValida(params.dados.margem_padrao_pct, 'A margem padrão');
  }

  return prisma.categoriaMercado.update({
    where: { id: categoria.id },
    data: dados,
    select: SELECAO_CATEGORIA
  });
}

export async function criarCategoria(params: {
  tenantId: string;
  nome: string;
  icone?: string | null;
  ordem?: number;
  margemPadraoPct?: unknown;
}) {
  const nome = String(params.nome || '').trim();
  if (nome.length < 2) throw new ValidationError('Informe o nome da categoria.');

  const slug = gerarSlug(nome);
  const existente = await prisma.categoriaMercado.findFirst({
    where: { tenant_id: params.tenantId, slug },
    select: { id: true }
  });
  if (existente) throw new ConflictError('Já existe uma categoria com este nome.');

  return prisma.categoriaMercado.create({
    data: {
      tenant_id: params.tenantId,
      nome,
      slug,
      icone: params.icone ? String(params.icone) : null,
      ordem: Number(params.ordem) || 0,
      margem_padrao_pct: margemValida(params.margemPadraoPct, 'A margem padrão')
    },
    select: SELECAO_CATEGORIA
  });
}

// ── Produtos: lado do lojista ────────────────────────────────────────────────

type DadosDoProduto = {
  nome?: unknown;
  descricao?: unknown;
  marca?: unknown;
  variacao?: unknown;
  tamanho?: unknown;
  sku?: unknown;
  ean?: unknown;
  fornecedor?: unknown;
  categoria_id?: unknown;
  custo?: unknown;
  margem_pct?: unknown;
  preco?: unknown;
  preco_promocional?: unknown;
  unidade?: unknown;
  peso_gramas?: unknown;
  estoque?: unknown;
  controla_estoque?: unknown;
  granel?: unknown;
  sob_encomenda?: unknown;
  prazo_reposicao_dias?: unknown;
  nota_interna?: unknown;
  exige_receita?: unknown;
  especie_alvo?: unknown;
  imagem_url?: unknown;
  imagem_alt?: unknown;
  imagem_status?: unknown;
  imagem_tem_etiqueta?: unknown;
  imagens?: unknown;
  ativo?: unknown;
};

const texto = (valor: unknown): string => String(valor ?? '').trim();
const textoOuNulo = (valor: unknown): string | null => (texto(valor) === '' ? null : texto(valor));

function dinheiro(valor: unknown, campo: string, obrigatorio = true): number | null {
  if (valor === null || valor === undefined || valor === '') {
    if (obrigatorio) throw new ValidationError(`Informe ${campo}.`);
    return null;
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) {
    throw new ValidationError(`${campo} precisa ser um valor válido.`);
  }
  if (numero > 999999.99) throw new ValidationError(`${campo} está acima do limite.`);
  return Math.round(numero * 100) / 100;
}

async function validarProduto(dados: DadosDoProduto, tenantId: string) {
  if (texto(dados.nome).length < 2) throw new ValidationError('Informe o nome do produto.');

  const preco = dinheiro(dados.preco, 'o preço') as number;
  if (preco <= 0) throw new ValidationError('O preço precisa ser maior que zero.');

  const promocional = dinheiro(dados.preco_promocional, 'o preço promocional', false);
  if (promocional !== null && promocional >= preco) {
    // Promoção que não desconta nada é propaganda enganosa na própria vitrine.
    throw new ValidationError('O preço promocional precisa ser menor que o preço normal.');
  }

  const custo = dinheiro(dados.custo, 'o custo', false);
  if (custo !== null && custo > preco) {
    // Não é erro do sistema — é prejuízo. Vale bloquear e deixar a loja decidir
    // se corrige o custo ou o preço.
    throw new ValidationError('O custo está acima do preço de venda. Revise os dois números.');
  }

  const margem = dados.margem_pct === null || dados.margem_pct === undefined || dados.margem_pct === ''
    ? null
    : Number(dados.margem_pct);
  if (margem !== null && (!Number.isFinite(margem) || margem < 0 || margem > 9.9999)) {
    throw new ValidationError('A margem precisa ser um número entre 0 e 9,99 (0,4 = 40%).');
  }

  const estoque = Number(dados.estoque ?? 0);
  if (!Number.isInteger(estoque) || estoque < 0) {
    throw new ValidationError('O estoque precisa ser um número inteiro igual ou maior que zero.');
  }

  const unidade = texto(dados.unidade) || 'un';
  if (!UNIDADES.has(unidade)) {
    throw new ValidationError(`Unidade inválida. Use uma destas: ${[...UNIDADES].join(', ')}.`);
  }

  const especie = textoOuNulo(dados.especie_alvo);
  if (especie && !ESPECIES.has(especie)) {
    throw new ValidationError('Espécie inválida. Use "cao", "gato", "passaro", "ambos" ou "outros".');
  }

  const sobEncomenda = Boolean(dados.sob_encomenda);
  const prazo = dados.prazo_reposicao_dias ? Number(dados.prazo_reposicao_dias) : null;
  if (sobEncomenda && (!prazo || prazo < 1)) {
    // "Sob encomenda" sem prazo é o tutor pagando hoje para descobrir a espera
    // depois. O prazo é o que torna a promessa verificável.
    throw new ValidationError('Produto sob encomenda precisa do prazo de reposição em dias.');
  }

  const categoriaId: string | null = textoOuNulo(dados.categoria_id);
  if (categoriaId) {
    const categoria = await prisma.categoriaMercado.findFirst({
      where: { id: categoriaId, tenant_id: tenantId },
      select: { id: true }
    });
    if (!categoria) throw new ValidationError('Categoria não encontrada.');
  }

  return { preco, promocional, custo, margem, estoque, unidade, especie, categoriaId, sobEncomenda, prazo };
}

/** A loja da pessoa logada, exigindo que ela exista. Toda escrita passa por aqui. */
export async function lojaDoResponsavel(tenantId: string, usuarioId: string) {
  const loja = await prisma.lojaMercado.findFirst({
    where: { tenant_id: tenantId, responsavel_id: usuarioId },
    select: { id: true, status: true, nome_fantasia: true, comissao_pct: true }
  });
  if (!loja) throw new NotFoundError('Você ainda não tem uma loja cadastrada.');
  return loja;
}

async function slugDoProduto(lojaId: string, nome: string, ignorarId?: string): Promise<string> {
  const raiz = gerarSlug(nome) || 'produto';
  for (let tentativa = 0; tentativa < 50; tentativa += 1) {
    const candidato = tentativa === 0 ? raiz : `${raiz}-${tentativa + 1}`;
    const existente = await prisma.produtoMercado.findFirst({
      where: { loja_id: lojaId, slug: candidato },
      select: { id: true }
    });
    if (!existente || existente.id === ignorarId) return candidato;
  }
  throw new ConflictError('Não foi possível gerar um endereço para este produto. Mude o nome.');
}

function camposDoProduto(dados: DadosDoProduto, validado: Awaited<ReturnType<typeof validarProduto>>) {
  return {
    categoria_id: validado.categoriaId,
    descricao: textoOuNulo(dados.descricao),
    marca: textoOuNulo(dados.marca),
    variacao: textoOuNulo(dados.variacao),
    tamanho: textoOuNulo(dados.tamanho),
    sku: textoOuNulo(dados.sku),
    ean: textoOuNulo(dados.ean) ? texto(dados.ean).replace(/\D/g, '') || null : null,
    fornecedor: textoOuNulo(dados.fornecedor),
    custo: validado.custo,
    margem_pct: validado.margem,
    preco: validado.preco,
    preco_promocional: validado.promocional,
    unidade: validado.unidade,
    peso_gramas: dados.peso_gramas ? Number(dados.peso_gramas) : null,
    estoque: validado.estoque,
    controla_estoque: dados.controla_estoque === undefined ? true : Boolean(dados.controla_estoque),
    granel: Boolean(dados.granel),
    sob_encomenda: validado.sobEncomenda,
    prazo_reposicao_dias: validado.prazo,
    nota_interna: textoOuNulo(dados.nota_interna),
    exige_receita: Boolean(dados.exige_receita),
    especie_alvo: validado.especie,
    ...normalizarImagem(dados),
    imagens: Array.isArray(dados.imagens) ? (dados.imagens as Prisma.InputJsonValue) : undefined,
    ativo: dados.ativo === undefined ? true : Boolean(dados.ativo)
  };
}

export async function listarProdutosDaLoja(params: {
  tenantId: string;
  lojaId: string;
  busca?: string | null;
  incluirInativos?: boolean;
}) {
  const where: Prisma.ProdutoMercadoWhereInput = { tenant_id: params.tenantId, loja_id: params.lojaId };
  if (!params.incluirInativos) where.ativo = true;
  if (params.busca) {
    where.OR = [
      { nome: { contains: String(params.busca), mode: 'insensitive' } },
      { marca: { contains: String(params.busca), mode: 'insensitive' } },
      { sku: { contains: String(params.busca), mode: 'insensitive' } },
      { ean: { contains: String(params.busca) } }
    ];
  }

  const produtos = await prisma.produtoMercado.findMany({
    where,
    select: CAMPOS_DO_LOJISTA,
    orderBy: [{ ativo: 'desc' }, { nome: 'asc' }]
  });

  return produtos.map((produto) => ({
    ...produto,
    preco_vigente: precoVigente(produto),
    // O painel mostra a pendência ao lado do item em vez de deixar o lojista
    // descobrir sozinho por que o produto não aparece na vitrine.
    disponivel: estaDisponivel(produto)
  }));
}

export async function criarProduto(params: { tenantId: string; usuarioId: string; dados: DadosDoProduto }) {
  const loja = await lojaDoResponsavel(params.tenantId, params.usuarioId);
  const validado = await validarProduto(params.dados, params.tenantId);
  const nome = texto(params.dados.nome);
  const slug = await slugDoProduto(loja.id, nome);

  return prisma.produtoMercado.create({
    data: {
      tenant_id: params.tenantId,
      loja_id: loja.id,
      nome,
      slug,
      ...camposDoProduto(params.dados, validado)
    },
    select: CAMPOS_DO_LOJISTA
  });
}

export async function atualizarProduto(params: {
  tenantId: string;
  usuarioId: string;
  produtoId: string;
  dados: DadosDoProduto;
}) {
  const loja = await lojaDoResponsavel(params.tenantId, params.usuarioId);

  // O filtro por `loja_id` é o que impede um lojista de editar o produto do
  // vizinho só tendo o UUID dele.
  const produto = await prisma.produtoMercado.findFirst({
    where: { id: params.produtoId, loja_id: loja.id, tenant_id: params.tenantId },
    select: { id: true, nome: true, slug: true }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');

  const validado = await validarProduto(params.dados, params.tenantId);
  const nome = texto(params.dados.nome);
  const slug = nome === produto.nome ? produto.slug : await slugDoProduto(loja.id, nome, produto.id);

  return prisma.produtoMercado.update({
    where: { id: produto.id },
    data: { nome, slug, ...camposDoProduto(params.dados, validado) },
    select: CAMPOS_DO_LOJISTA
  });
}

/**
 * Tirar da vitrine é desativar, não apagar.
 *
 * O produto está citado em pedidos antigos, e apagar a linha levaria junto o
 * histórico de quem comprou. O item do pedido guarda uma cópia do nome e do
 * preço justamente para o histórico sobreviver — mas a referência ainda serve
 * para o lojista reativar o mesmo produto em vez de recadastrar.
 */
export async function desativarProduto(params: { tenantId: string; usuarioId: string; produtoId: string }) {
  const loja = await lojaDoResponsavel(params.tenantId, params.usuarioId);

  const produto = await prisma.produtoMercado.findFirst({
    where: { id: params.produtoId, loja_id: loja.id, tenant_id: params.tenantId },
    select: { id: true }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');

  const [atualizado] = await prisma.$transaction([
    prisma.produtoMercado.update({
      where: { id: produto.id },
      data: { ativo: false },
      select: CAMPOS_DO_LOJISTA
    }),
    // Fora da vitrine, fora do carrinho. Deixar o item lá faria o tutor abrir o
    // carrinho no dia seguinte e levar um erro no fechamento, sem entender.
    prisma.itemCarrinhoMercado.deleteMany({ where: { produto_id: produto.id } })
  ]);

  return atualizado;
}

// ── Produtos: lado do tutor ──────────────────────────────────────────────────

export async function buscarNaVitrine(params: {
  tenantId: string;
  busca?: string | null;
  categoriaSlug?: string | null;
  lojaId?: string | null;
  cidade?: string | null;
  especie?: string | null;
  limite?: number;
  pagina?: number;
}) {
  const limite = Math.min(Math.max(Number(params.limite) || 24, 1), 60);
  const pagina = Math.max(Number(params.pagina) || 1, 1);

  // Cada critério entra como uma cláusula independente em `AND`. Empilhar tudo
  // em `OR` no mesmo objeto faria o filtro de espécie apagar o de busca (e
  // vice-versa), devolvendo resultado a mais em vez de a menos.
  const clausulas: Prisma.ProdutoMercadoWhereInput[] = [DISPONIVEL];

  const daLoja: Prisma.LojaMercadoWhereInput = { ...LOJA_PUBLICA };
  if (params.cidade) daLoja.cidade = { equals: String(params.cidade), mode: 'insensitive' };

  const where: Prisma.ProdutoMercadoWhereInput = {
    tenant_id: params.tenantId,
    ativo: true,
    loja: daLoja
  };

  if (params.lojaId) where.loja_id = String(params.lojaId);
  if (params.categoriaSlug) where.categoria = { slug: String(params.categoriaSlug) };

  if (params.especie && ESPECIES.has(String(params.especie))) {
    // "ambos" e produto sem espécie servem os dois — filtrar pela espécie exata
    // esconderia metade do catálogo de quem tem gato.
    clausulas.push({
      OR: [{ especie_alvo: String(params.especie) }, { especie_alvo: 'ambos' }, { especie_alvo: null }]
    });
  }

  if (params.busca) {
    const termo = String(params.busca);
    clausulas.push({
      OR: [
        { nome: { contains: termo, mode: 'insensitive' } },
        { marca: { contains: termo, mode: 'insensitive' } },
        { variacao: { contains: termo, mode: 'insensitive' } },
        { descricao: { contains: termo, mode: 'insensitive' } }
      ]
    });
  }

  where.AND = clausulas;

  const [total, produtos] = await Promise.all([
    prisma.produtoMercado.count({ where }),
    prisma.produtoMercado.findMany({
      where,
      select: {
        ...CAMPOS_PUBLICOS,
        loja: { select: { id: true, nome_fantasia: true, slug: true, cidade: true, prazo_preparo_min: true } }
      },
      orderBy: [{ nome: 'asc' }],
      skip: (pagina - 1) * limite,
      take: limite
    })
  ]);

  return {
    total,
    pagina,
    paginas: Math.max(1, Math.ceil(total / limite)),
    produtos: produtos.map((produto) => ({ ...produto, preco_vigente: precoVigente(produto) }))
  };
}

export async function produtoDaVitrine(params: { tenantId: string; produtoId: string }) {
  const produto = await prisma.produtoMercado.findFirst({
    where: {
      id: params.produtoId,
      tenant_id: params.tenantId,
      ativo: true,
      loja: LOJA_PUBLICA
    },
    select: {
      ...CAMPOS_PUBLICOS,
      loja: {
        select: {
          id: true,
          nome_fantasia: true,
          slug: true,
          cidade: true,
          estado: true,
          endereco: true,
          bairro: true,
          telefone: true,
          prazo_preparo_min: true,
          pedido_minimo: true,
          aceita_retirada: true,
          aceita_combinar: true,
          aceita_entrega: true,
          entrega_raio_km: true,
          frete_gratis_acima: true,
          entrega_prazo_horas: true,
          aceita_assinatura: true,
          assinatura_desconto_pct: true,
          assinatura_frete_gratis: true
        }
      }
    }
  });
  if (!produto) throw new NotFoundError('Produto não encontrado.');

  return { ...produto, preco_vigente: precoVigente(produto), disponivel: estaDisponivel(produto) };
}

export { CAMPOS_PUBLICOS, CAMPOS_DO_LOJISTA };
export { DISPONIVEL, ESPECIES, estaDisponivel, limiteDoItem, precoSugerido, precoVigente, UNIDADES };
