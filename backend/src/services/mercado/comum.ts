import type { Prisma } from '@prisma/client';

/**
 * O que o módulo do mercado compartilha e não pertence a nenhuma camada.
 *
 * Existe por um motivo concreto: `loja` precisa saber o que é um produto
 * disponível (para não listar loja de prateleira vazia) e `catálogo` precisa
 * saber gerar slug (que é regra da loja). Importar um do outro fecharia um
 * ciclo — que em CommonJS não estoura, apenas entrega `undefined` no momento
 * errado, que é a pior forma de quebrar. Aqui embaixo não há dependência
 * nenhuma, então ninguém fecha ciclo com ninguém.
 */

// ── Texto ─────────────────────────────────────────────────────────────────────

export function gerarSlug(texto: string): string {
  return String(texto || '')
    .normalize('NFD')
    // Marcas de acentuação separadas pelo NFD (U+0300–U+036F).
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Só dígitos, para comparar CNPJ/telefone digitado com máscara e sem. */
export function apenasDigitos(valor: unknown): string {
  return String(valor ?? '').replace(/\D/g, '');
}

/**
 * Validação de CNPJ pelos dois dígitos verificadores.
 *
 * Sem isto, o cadastro aceitaria "00000000000000" e a loja entraria na fila de
 * aprovação com um documento que não existe — fazendo a equipe gastar
 * conferência manual num campo que o próprio sistema poderia ter recusado.
 */
export function cnpjValido(entrada: string): boolean {
  const cnpj = apenasDigitos(entrada);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const digito = (base: string): number => {
    const pesos =
      base.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base
      .split('')
      .reduce((total, caractere, indice) => total + Number(caractere) * pesos[indice], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  return digito(cnpj.slice(0, 12)) === Number(cnpj[12]) && digito(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

// ── Disponibilidade ───────────────────────────────────────────────────────────

/**
 * O que está à venda de verdade.
 *
 * Três formas de um produto estar disponível, e nenhuma delas é "tem número
 * maior que zero numa coluna":
 *
 * 1. A loja controla estoque e ainda tem peça.
 * 2. A loja NÃO controla estoque — vende enquanto tem e confere na separação.
 *    É como funciona o petshop de bairro, e exigir contagem dele faria uma
 *    prateleira cheia aparecer como esgotada. O levantamento de 26/08/2026 na
 *    Casa de Rações Filhos de 4 Patas voltou com 175 itens e nenhuma contagem:
 *    é o caso comum, não a exceção.
 * 3. O item é sob encomenda: não está na loja, mas a loja busca — com prazo à
 *    vista, para ninguém pagar hoje e descobrir a espera depois.
 */
export const DISPONIVEL: Prisma.ProdutoMercadoWhereInput = {
  OR: [{ controla_estoque: false }, { sob_encomenda: true }, { estoque: { gt: 0 } }]
};

/**
 * O que é uma loja PÚBLICA: aprovada e que não é de demonstração.
 *
 * É a única definição, e toda leitura que sai para fora (vitrine logada, vitrine
 * sem sessão, catálogo, carrinho, assinatura, feed do Google/WhatsApp, sitemap)
 * espalha este objeto no `where` da loja. Antes cada uma escrevia
 * `status: 'aprovada'` por conta própria — e foi assim que a loja de
 * demonstração do seed, aprovada no painel em 01/09/2026, entrou no Google.
 * Uma regra num lugar só não deixa a próxima leitura nova esquecer o filtro.
 */
export const LOJA_PUBLICA = {
  status: 'aprovada',
  demonstracao: false
} as const satisfies Prisma.LojaMercadoWhereInput;

/** Está disponível? A mesma regra do filtro acima, aplicada a um item já lido. */
export function estaDisponivel(produto: {
  ativo?: boolean;
  controla_estoque?: boolean;
  sob_encomenda?: boolean;
  estoque?: number;
}): boolean {
  if (produto.ativo === false) return false;
  if (produto.controla_estoque === false) return true;
  if (produto.sob_encomenda === true) return true;
  return Number(produto.estoque || 0) > 0;
}

/**
 * Quanto dá para levar deste item.
 *
 * Sem contagem, o teto é o limite de sanidade do carrinho — não zero, que é o
 * que uma leitura ingênua da coluna `estoque` diria.
 */
export function limiteDoItem(
  produto: { controla_estoque?: boolean; sob_encomenda?: boolean; estoque?: number },
  tetoDoCarrinho: number
): number {
  if (produto.controla_estoque === false || produto.sob_encomenda === true) return tetoDoCarrinho;
  return Math.min(Number(produto.estoque || 0), tetoDoCarrinho);
}

// ── Dinheiro ──────────────────────────────────────────────────────────────────

/** O que o tutor efetivamente paga: promoção quando ela é menor que o de tabela. */
export function precoVigente(produto: { preco: unknown; preco_promocional?: unknown }): number {
  const cheio = Number(produto.preco);
  const promocional =
    produto.preco_promocional === null || produto.preco_promocional === undefined
      ? null
      : Number(produto.preco_promocional);

  if (promocional !== null && Number.isFinite(promocional) && promocional > 0 && promocional < cheio) {
    return Math.round(promocional * 100) / 100;
  }
  return Math.round(cheio * 100) / 100;
}

/**
 * Preço sugerido pelo custo e pela margem.
 *
 * A planilha do levantamento calcula isso numa coluna; aqui a conta é a mesma,
 * para o painel poder oferecer o número em vez de exigir calculadora. É
 * SUGESTÃO: quem manda no preço continua sendo a loja.
 */
export function precoSugerido(custo: unknown, margemPct: unknown): number | null {
  const valor = Number(custo);
  const margem = Number(margemPct);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  if (!Number.isFinite(margem) || margem < 0) return null;
  return Math.round(valor * (1 + margem) * 100) / 100;
}

// ── Vocabulário do catálogo ───────────────────────────────────────────────────

/**
 * As unidades que a loja realmente usa para vender.
 *
 * Não é lista de laboratório: saiu do levantamento de campo, onde os 175 itens
 * se venderam em saco, quilo, sachê, pacote, lata, pote, caixa, kit, conjunto,
 * par, rolo e unidade. Sem `saco`, o carrinho escreveria "1 un" para um saco de
 * 15 kg de ração.
 */
export const UNIDADES = new Set([
  'un', 'kg', 'g', 'l', 'ml',
  'saco', 'pacote', 'caixa', 'frasco', 'lata', 'sache', 'pote',
  'kit', 'conjunto', 'par', 'rolo'
]);

/**
 * A espécie NÃO é categoria.
 *
 * A planilha de campo trazia "Ração cão" e "Ração gato" como prateleiras
 * separadas. Aqui é uma prateleira ("Ração") mais este campo — senão quem tem
 * cão e gato procuraria a mesma ração duas vezes.
 */
export const ESPECIES = new Set(['cao', 'gato', 'passaro', 'ambos', 'outros']);

/** Como escrever a unidade ao lado do número, no singular e no plural. */
export const NOME_DA_UNIDADE: Record<string, [string, string]> = {
  un: ['un', 'un'],
  kg: ['kg', 'kg'],
  g: ['g', 'g'],
  l: ['L', 'L'],
  ml: ['ml', 'ml'],
  saco: ['saco', 'sacos'],
  pacote: ['pacote', 'pacotes'],
  caixa: ['caixa', 'caixas'],
  frasco: ['frasco', 'frascos'],
  lata: ['lata', 'latas'],
  sache: ['sachê', 'sachês'],
  pote: ['pote', 'potes'],
  kit: ['kit', 'kits'],
  conjunto: ['conjunto', 'conjuntos'],
  par: ['par', 'pares'],
  rolo: ['rolo', 'rolos']
};

// ── Margem ────────────────────────────────────────────────────────────────────

/**
 * O último recurso da conta de preço.
 *
 * Até 27/08/2026 era o único: toda sugestão saía de 40% sobre o custo. O plano
 * comercial trocou isso por margem POR CATEGORIA (ração premium suporta 18–30%;
 * acessório, cosmético e brinquedo, bem mais). O produto usa a própria margem
 * quando tem; herda a da prateleira quando não; e só cai aqui quando nem a
 * prateleira decidiu.
 */
export const MARGEM_PADRAO = 0.4;

export function margemEfetiva(margemDoProduto: unknown, margemDaCategoria: unknown): number {
  for (const candidata of [margemDoProduto, margemDaCategoria]) {
    if (candidata === null || candidata === undefined || candidata === '') continue;
    const numero = Number(candidata);
    if (Number.isFinite(numero) && numero >= 0) return numero;
  }
  return MARGEM_PADRAO;
}

// ── Entrega pela loja ─────────────────────────────────────────────────────────

/**
 * Endereços de vitrine que não podem virar slug de loja.
 *
 * `/mercado/loja` é o painel do lojista; `/mercado/<slug>` é a vitrine pública.
 * Uma loja chamada "Loja" ganharia o slug `loja` e a URL pública dela seria o
 * painel de outra pessoa. O roteador do navegador prefere o caminho estático,
 * então nada vazaria — mas a loja ficaria sem vitrine e ninguém saberia por quê.
 */
export const SLUGS_RESERVADOS = new Set(['loja', 'lojas', 'produto', 'produtos', 'feed', 'painel', 'catalogo', 'admin']);

export type PoliticaDeEntrega = {
  aceita_entrega: boolean;
  entrega_raio_km: unknown;
  frete_base: unknown;
  frete_por_km: unknown;
  frete_gratis_acima: unknown;
};

export type CotacaoDeEntrega = {
  /** Dá para entregar neste endereço? Falso vem sempre com `motivo`. */
  disponivel: boolean;
  motivo: string | null;
  distancia_km: number | null;
  raio_km: number | null;
  frete: number;
  frete_gratis: boolean;
  /** Quanto falta no subtotal para o frete zerar. Nulo quando não há piso. */
  falta_para_frete_gratis: number | null;
};

const centavos = (valor: number): number => Math.round(valor * 100) / 100;

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

const quilometros = (valor: number): string => valor.toFixed(1).replace('.', ',');

/**
 * O frete de uma entrega, pela política da loja e pela distância.
 *
 * É função pura de propósito: o mesmo cálculo responde à cotação no carrinho
 * (antes de a pessoa escolher) e ao fechamento do pedido (quando o número vira
 * cobrança). Se fossem duas contas, um dia divergiriam — e a tela prometeria um
 * frete que o pedido não cobraria.
 *
 * Fora do raio não é frete caro: é recusa. Ração de quinze quilos a trinta
 * quilômetros não fecha conta para ninguém, e "entregamos, mas custa R$ 90" é
 * o tipo de surpresa que faz a pessoa não voltar.
 */
export function cotarFrete(
  loja: PoliticaDeEntrega,
  distanciaKm: number | null,
  subtotal: number
): CotacaoDeEntrega {
  const raio = numeroOuNulo(loja.entrega_raio_km);
  const base: Omit<CotacaoDeEntrega, 'disponivel' | 'motivo'> = {
    distancia_km: distanciaKm,
    raio_km: raio,
    frete: 0,
    frete_gratis: false,
    falta_para_frete_gratis: null
  };

  if (!loja.aceita_entrega) {
    return { ...base, disponivel: false, motivo: 'Esta loja não entrega em casa.' };
  }
  if (raio === null || raio <= 0) {
    return { ...base, disponivel: false, motivo: 'Esta loja ainda não definiu a área de entrega.' };
  }
  if (distanciaKm === null || !Number.isFinite(distanciaKm)) {
    return { ...base, disponivel: false, motivo: 'Não conseguimos localizar o endereço de entrega.' };
  }
  if (distanciaKm > raio) {
    return {
      ...base,
      disponivel: false,
      motivo: `Fora da área de entrega desta loja: ela leva até ${quilometros(raio)} km e o endereço fica a ${quilometros(distanciaKm)} km.`
    };
  }

  const freteBase = numeroOuNulo(loja.frete_base) ?? 0;
  const fretePorKm = numeroOuNulo(loja.frete_por_km) ?? 0;
  const piso = numeroOuNulo(loja.frete_gratis_acima);

  const calculado = centavos(Math.max(0, freteBase) + Math.max(0, fretePorKm) * distanciaKm);
  const gratis = piso !== null && piso >= 0 && subtotal >= piso;

  return {
    ...base,
    disponivel: true,
    motivo: null,
    frete: gratis ? 0 : calculado,
    frete_gratis: gratis,
    falta_para_frete_gratis: piso !== null && !gratis ? centavos(piso - subtotal) : null
  };
}

// ── Foto de capa: status e etiqueta ──────────────────────────────────────────

/**
 * `aprovada` é o que a vitrine mostra; `revisar` é a fila de QA (a foto existe,
 * mas alguém precisa olhar antes de publicar); `rejeitada` fecha a fila sem
 * publicar. Produto sem capa não tem status, por definição.
 */
export const STATUS_DE_IMAGEM = new Set(['aprovada', 'revisar', 'rejeitada']);
export const TAMANHO_MAXIMO_DO_ALT = 160;

export function normalizarImagem(dados: {
  imagem_url?: unknown;
  imagem_alt?: unknown;
  imagem_status?: unknown;
  imagem_tem_etiqueta?: unknown;
}): { imagem_url: string | null; imagem_alt: string | null; imagem_status: string | null; imagem_tem_etiqueta: boolean } {
  const url = String(dados.imagem_url ?? '').trim() || null;
  // Leitor de tela e Google leem o alt como uma frase, não como descrição.
  const alt = String(dados.imagem_alt ?? '').trim().slice(0, TAMANHO_MAXIMO_DO_ALT) || null;
  if (!url) return { imagem_url: null, imagem_alt: alt, imagem_status: null, imagem_tem_etiqueta: false };
  const status = String(dados.imagem_status ?? '').trim();
  return {
    imagem_url: url,
    imagem_alt: alt,
    // Foto que o próprio lojista escolheu como capa nasce aprovada: ele é quem
    // responde pelo catálogo. O status só é outro quando alguém disse que é.
    imagem_status: STATUS_DE_IMAGEM.has(status) ? status : 'aprovada',
    imagem_tem_etiqueta: dados.imagem_tem_etiqueta === true || dados.imagem_tem_etiqueta === 'true'
  };
}
