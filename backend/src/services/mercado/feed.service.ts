import prisma from '../../config/database';
import { DISPONIVEL, LOJA_PUBLICA, estaDisponivel, precoVigente } from './comum';
import { listaDeFotos } from './imagem-produto.service';

const { escapeXml } = require('../blog-render.service');

/**
 * O catálogo da loja, no formato que o WhatsApp e o Google leem.
 *
 * Dois canais do plano comercial de 27/08/2026 dependem disto e custam zero de
 * mídia: o catálogo do WhatsApp Business (Fase 0, "canal principal de venda")
 * e a listagem gratuita do Google Shopping pelo Merchant Center (Fase 2). Os
 * dois aceitam o MESMO formato — o feed de produtos do Google, em RSS 2.0 com
 * o namespace `g:` — e os dois aceitam uma URL programada, que releem sozinhos.
 * Então o catálogo é cadastrado UMA vez, aqui, e aparece nos três lugares.
 *
 * Regras dos dois lados que moldam o que sai daqui:
 *
 * - **Item sem foto é recusado.** Não entra no feed; a tela do lojista mostra
 *   quantos ficaram de fora e por quê, em vez de o Merchant devolver um erro
 *   que ninguém lê.
 * - **Preço vem com moeda** (`196.50 BRL`), com ponto decimal, sem símbolo.
 * - **O link tem de ser público.** Por isso existe a vitrine pública
 *   (`/mercado/<loja>/<produto>`): a área logada do tutor não serve para o
 *   Google chegar, nem para o cliente que clicou no WhatsApp.
 */

export type ItemDoFeed = {
  id: string;
  title: string;
  description: string;
  link: string;
  image_link: string;
  additional_image_link: string[];
  availability: 'in_stock' | 'out_of_stock';
  price: string;
  sale_price: string | null;
  brand: string | null;
  condition: 'new';
  gtin: string | null;
  identifier_exists: 'yes' | 'no';
  product_type: string | null;
  shipping_weight: string | null;
  loja: string;
};

export type ProdutoParaFeed = {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  marca: string | null;
  variacao: string | null;
  tamanho: string | null;
  preco: unknown;
  preco_promocional: unknown;
  ean: string | null;
  peso_gramas: number | null;
  estoque: number;
  controla_estoque: boolean;
  sob_encomenda: boolean;
  ativo: boolean;
  imagem_url: string | null;
  imagens: unknown;
  categoria: { nome: string } | null;
  loja: { nome_fantasia: string; slug: string; cidade: string; estado: string };
};

const SELECAO_PRODUTO = {
  id: true,
  nome: true,
  slug: true,
  descricao: true,
  marca: true,
  variacao: true,
  tamanho: true,
  preco: true,
  preco_promocional: true,
  ean: true,
  peso_gramas: true,
  estoque: true,
  controla_estoque: true,
  sob_encomenda: true,
  ativo: true,
  imagem_url: true,
  imagens: true,
  categoria: { select: { nome: true } },
  loja: { select: { nome_fantasia: true, slug: true, cidade: true, estado: true } }
} as const;

/** Sem barra no fim: as URLs são montadas por concatenação. */
export const baseDoSite = (): string =>
  (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');

/** `196.5` → `196.50 BRL`. O formato exigido pelos dois leitores. */
export const precoDoFeed = (valor: unknown): string => `${Number(valor).toFixed(2)} BRL`;

/** Título do item: nome, variação e tamanho — o que diferencia um saco do outro. */
function tituloDoItem(produto: ProdutoParaFeed): string {
  return [produto.nome, produto.variacao, produto.tamanho]
    .filter((parte) => parte && String(parte).trim())
    .join(' · ')
    .slice(0, 150);
}

function descricaoDoItem(produto: ProdutoParaFeed): string {
  const partes = [
    produto.descricao,
    produto.marca ? `Marca: ${produto.marca}.` : null,
    produto.sob_encomenda ? 'Produto sob encomenda.' : null,
    `Vendido por ${produto.loja.nome_fantasia}, ${produto.loja.cidade}/${produto.loja.estado}.`
  ].filter(Boolean);
  return partes.join(' ').replace(/\s+/g, ' ').trim().slice(0, 5000) || tituloDoItem(produto);
}

/**
 * Converte um produto do banco no item do feed. Devolve `null` para o que os
 * leitores recusariam — hoje, só o item sem foto.
 */
export function itemDoFeed(produto: ProdutoParaFeed, base: string): ItemDoFeed | null {
  const capa = produto.imagem_url || listaDeFotos(produto.imagens)[0] || null;
  if (!capa) return null;

  const cheio = Math.round(Number(produto.preco) * 100) / 100;
  const vigente = precoVigente(produto);
  const gtin = produto.ean && /^\d{8,14}$/.test(produto.ean) ? produto.ean : null;

  return {
    id: produto.id,
    title: tituloDoItem(produto),
    description: descricaoDoItem(produto),
    link: `${base}/mercado/${produto.loja.slug}/${produto.slug}`,
    image_link: capa,
    additional_image_link: listaDeFotos(produto.imagens).filter((foto) => foto !== capa).slice(0, 10),
    availability: estaDisponivel(produto) ? 'in_stock' : 'out_of_stock',
    price: precoDoFeed(cheio),
    sale_price: vigente < cheio ? precoDoFeed(vigente) : null,
    brand: produto.marca,
    condition: 'new',
    gtin,
    // Sem GTIN o Google exige que a gente DIGA que não existe; do contrário
    // trata o item como incompleto e não o publica.
    identifier_exists: gtin ? 'yes' : 'no',
    product_type: produto.categoria?.nome || null,
    shipping_weight: produto.peso_gramas ? `${(produto.peso_gramas / 1000).toFixed(2)} kg` : null,
    loja: produto.loja.nome_fantasia
  };
}

// ── Leitura ───────────────────────────────────────────────────────────────────

export async function produtosParaOFeed(params: { tenantId: string; lojaSlug?: string | null }) {
  const produtos = await prisma.produtoMercado.findMany({
    where: {
      tenant_id: params.tenantId,
      ativo: true,
      loja: {
        ...LOJA_PUBLICA,
        ...(params.lojaSlug ? { slug: params.lojaSlug } : {})
      }
    },
    select: SELECAO_PRODUTO,
    orderBy: [{ loja: { nome_fantasia: 'asc' } }, { nome: 'asc' }]
  });
  return produtos as unknown as ProdutoParaFeed[];
}

export async function montarFeed(params: { tenantId: string; lojaSlug?: string | null }) {
  const base = baseDoSite();
  const produtos = await produtosParaOFeed(params);
  const itens: ItemDoFeed[] = [];
  let semFoto = 0;

  for (const produto of produtos) {
    const item = itemDoFeed(produto, base);
    if (item) itens.push(item);
    else semFoto += 1;
  }

  return { itens, sem_foto: semFoto, total: produtos.length, base };
}

// ── Formatos ──────────────────────────────────────────────────────────────────

const tag = (nome: string, valor: string | null | undefined): string =>
  valor === null || valor === undefined || valor === '' ? '' : `<${nome}>${escapeXml(String(valor))}</${nome}>`;

/** RSS 2.0 com namespace do Google — o que o Merchant Center e o Meta leem. */
export function feedXml(itens: ItemDoFeed[], opcoes: { titulo: string; base: string; descricao?: string }): string {
  const corpo = itens
    .map((item) =>
      [
        '<item>',
        tag('g:id', item.id),
        tag('g:title', item.title),
        tag('g:description', item.description),
        tag('g:link', item.link),
        tag('g:image_link', item.image_link),
        ...item.additional_image_link.map((foto) => tag('g:additional_image_link', foto)),
        tag('g:availability', item.availability),
        tag('g:price', item.price),
        tag('g:sale_price', item.sale_price),
        tag('g:brand', item.brand),
        tag('g:condition', item.condition),
        tag('g:gtin', item.gtin),
        tag('g:identifier_exists', item.identifier_exists),
        tag('g:product_type', item.product_type),
        tag('g:shipping_weight', item.shipping_weight),
        '</item>'
      ]
        .filter(Boolean)
        .join('')
    )
    .join('\n');

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    '<channel>',
    tag('title', opcoes.titulo),
    tag('link', opcoes.base),
    tag('description', opcoes.descricao || opcoes.titulo),
    corpo,
    '</channel>',
    '</rss>'
  ].join('\n');
}

const COLUNAS_CSV = [
  'id',
  'title',
  'description',
  'availability',
  'condition',
  'price',
  'sale_price',
  'link',
  'image_link',
  'additional_image_link',
  'brand',
  'gtin',
  'identifier_exists',
  'product_type',
  'shipping_weight'
] as const;

/** Aspas duplas em volta de tudo, aspas internas dobradas: é o CSV que o Excel e o Meta leem igual. */
const celula = (valor: unknown): string => `"${String(valor ?? '').replace(/"/g, '""')}"`;

/** CSV com as colunas do Meta Commerce Manager (que o Google também aceita). */
export function feedCsv(itens: ItemDoFeed[]): string {
  const linhas = itens.map((item) =>
    COLUNAS_CSV.map((coluna) => {
      const valor = item[coluna];
      return celula(Array.isArray(valor) ? valor.join(',') : valor);
    }).join(',')
  );
  // BOM no início: sem ele o Excel abre "Ração" como "RaÃ§Ã£o".
  return `﻿${[COLUNAS_CSV.join(','), ...linhas].join('\r\n')}\r\n`;
}

// ── Sitemap ───────────────────────────────────────────────────────────────────

/** As URLs públicas do mercado, para o sitemap do site. */
export async function urlsDoMercadoParaSitemap(tenantId: string, base: string): Promise<string[]> {
  const lojas = await prisma.lojaMercado.findMany({
    where: { tenant_id: tenantId, ...LOJA_PUBLICA, produtos: { some: { ativo: true, ...DISPONIVEL } } },
    select: {
      slug: true,
      atualizado_em: true,
      produtos: { where: { ativo: true, ...DISPONIVEL }, select: { slug: true, atualizado_em: true } }
    }
  });
  if (lojas.length === 0) return [];

  const url = (caminho: string, quando: Date) =>
    `<url><loc>${escapeXml(`${base}${caminho}`)}</loc><lastmod>${quando.toISOString()}</lastmod></url>`;

  const maisRecente = lojas.reduce(
    (data, loja) => (loja.atualizado_em > data ? loja.atualizado_em : data),
    lojas[0].atualizado_em
  );

  return [
    url('/mercado', maisRecente),
    ...lojas.flatMap((loja) => [
      url(`/mercado/${loja.slug}`, loja.atualizado_em),
      ...loja.produtos.map((produto) => url(`/mercado/${loja.slug}/${produto.slug}`, produto.atualizado_em))
    ])
  ];
}
