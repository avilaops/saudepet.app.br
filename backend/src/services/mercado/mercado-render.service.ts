import fs from 'fs/promises';
import path from 'path';
import { listaDeFotos } from './imagem-produto.service';
import { lojaPublica, lojasPublicas, produtoPublico, produtosPublicos } from './vitrine-publica.service';

const { escapeHtml, injectPageMetadata, replaceRoot, snapshotStyles } = require('../blog-render.service');

/**
 * O HTML inicial das páginas públicas do mercado.
 *
 * O React assume a tela depois do carregamento; o que sai daqui é o que o
 * Google, o WhatsApp (ao montar a prévia do link) e o leitor de tela recebem
 * ANTES disso: título, descrição, JSON-LD de `Product`/`Store` e o conteúdo
 * essencial já no corpo. É o mesmo desenho do blog — e reaproveita as mesmas
 * funções, para as duas partes públicas do site não divergirem.
 */

type Loja = Omit<Awaited<ReturnType<typeof lojasPublicas>>[number], 'total_produtos'>;

async function lerTemplate(): Promise<string> {
  const candidatos = [
    process.env.FRONTEND_INDEX_PATH,
    '/usr/share/nginx/html/index.html',
    path.resolve(__dirname, '../../../../frontend/dist/index.html')
  ].filter((candidato): candidato is string => Boolean(candidato));

  let ultimoErro: unknown;
  for (const candidato of candidatos) {
    try {
      return await fs.readFile(candidato, 'utf8');
    } catch (erro) {
      ultimoErro = erro;
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('index.html do frontend não encontrado');
}

const reais = (valor: unknown): string =>
  Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const enderecoDaLoja = (loja: Loja): string =>
  [loja.endereco, loja.complemento, loja.bairro].filter(Boolean).join(', ') + ` — ${loja.cidade}/${loja.estado}`;

/** JSON-LD de loja física: é o que faz "petshop perto de mim" achar a loja. */
function jsonLdDaLoja(loja: Loja, base: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'PetStore',
    name: loja.nome_fantasia,
    description: loja.descricao || undefined,
    url: `${base}/mercado/${loja.slug}`,
    telephone: loja.telefone,
    image: loja.logo_url || undefined,
    address: {
      '@type': 'PostalAddress',
      streetAddress: [loja.endereco, loja.complemento].filter(Boolean).join(', '),
      addressLocality: loja.cidade,
      addressRegion: loja.estado,
      addressCountry: 'BR'
    },
    ...(loja.latitude != null && loja.longitude != null
      ? { geo: { '@type': 'GeoCoordinates', latitude: loja.latitude, longitude: loja.longitude } }
      : {})
  };
}

function naoEncontrado(template: string, base: string, mensagem: string): string {
  const html = injectPageMetadata(template, {
    title: 'Página não encontrada | Saúde PET Mercado',
    description: mensagem,
    canonical: `${base}/mercado`,
    image: `${base}/og-default.png`,
    jsonLd: null,
    robots: 'noindex,nofollow'
  });
  return replaceRoot(
    html,
    `${snapshotStyles}<main data-server-content="mercado-404"><h1>Página não encontrada</h1><p>${escapeHtml(mensagem)}</p><p><a href="/mercado">Ver as lojas do mercado</a></p></main>`
  );
}

// ── Índice: /mercado ──────────────────────────────────────────────────────────

export async function renderizarIndice(tenantId: string, base: string): Promise<{ status: number; html: string }> {
  const [template, lojas] = await Promise.all([lerTemplate(), lojasPublicas(tenantId)]);

  const title = 'Mercado Saúde PET — ração, remédios e acessórios de lojas perto de você';
  const description = lojas.length
    ? `${lojas.length} loja(s) pet com retirada no balcão ou entrega: ${lojas.map((loja) => `${loja.nome_fantasia} (${loja.cidade})`).join(', ')}.`
    : 'Lojas pet da sua cidade com retirada no balcão e entrega, pagando por Pix ou cartão no Saúde PET.';

  const html = injectPageMetadata(template, {
    title,
    description,
    canonical: `${base}/mercado`,
    image: `${base}/og-default.png`,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Lojas do Mercado Saúde PET',
      itemListElement: lojas.map((loja, indice) => ({
        '@type': 'ListItem',
        position: indice + 1,
        url: `${base}/mercado/${loja.slug}`,
        name: loja.nome_fantasia
      }))
    }
  });

  const lista = lojas.length
    ? `<ul>${lojas
        .map(
          (loja) =>
            `<li><a href="/mercado/${escapeHtml(loja.slug)}">${escapeHtml(loja.nome_fantasia)}</a> — ${escapeHtml(loja.cidade)}/${escapeHtml(loja.estado)} · ${loja.total_produtos} produto(s)</li>`
        )
        .join('')}</ul>`
    : '<p>Ainda não há lojas publicadas. Em breve.</p>';

  return {
    status: 200,
    html: replaceRoot(
      html,
      `${snapshotStyles}<main data-server-content="mercado"><span class="server-kicker">Saúde PET Mercado</span><h1>Lojas pet perto de você</h1><p class="server-excerpt">${escapeHtml(description)}</p>${lista}</main>`
    )
  };
}

// ── Loja: /mercado/:slug ──────────────────────────────────────────────────────

export async function renderizarLoja(
  tenantId: string,
  slug: string,
  base: string
): Promise<{ status: number; html: string }> {
  const template = await lerTemplate();

  let dados: Awaited<ReturnType<typeof lojaPublica>>;
  try {
    dados = await lojaPublica(tenantId, slug);
  } catch {
    return { status: 404, html: naoEncontrado(template, base, 'Esta loja não está no ar.') };
  }

  const { loja } = dados;
  const { produtos, total } = await produtosPublicos({ tenantId, lojaSlug: slug, limite: 40 });

  const title = `${loja.nome_fantasia} — loja pet em ${loja.cidade} | Saúde PET Mercado`;
  const description = (loja.descricao || `${loja.nome_fantasia} em ${loja.cidade}/${loja.estado}: ${total} produto(s) para o seu pet, com retirada no balcão${loja.aceita_entrega ? ' e entrega' : ''}.`).slice(0, 300);

  const html = injectPageMetadata(template, {
    title,
    description,
    canonical: `${base}/mercado/${loja.slug}`,
    image: loja.logo_url || `${base}/og-default.png`,
    jsonLd: jsonLdDaLoja(loja, base)
  });

  const lista = produtos
    .map(
      (produto) =>
        `<li><a href="/mercado/${escapeHtml(loja.slug)}/${escapeHtml(produto.slug)}">${escapeHtml(produto.nome)}</a>${
          produto.variacao ? ` · ${escapeHtml(produto.variacao)}` : ''
        } — ${reais(produto.preco_vigente)}</li>`
    )
    .join('');

  return {
    status: 200,
    html: replaceRoot(
      html,
      `${snapshotStyles}<main data-server-content="mercado-loja"><span class="server-kicker">Saúde PET Mercado</span><h1>${escapeHtml(loja.nome_fantasia)}</h1><p class="server-excerpt">${escapeHtml(description)}</p><p class="server-meta">${escapeHtml(enderecoDaLoja(loja))} · ${escapeHtml(loja.telefone)}</p><h2>Produtos</h2><ul>${lista}</ul></main>`
    )
  };
}

// ── Produto: /mercado/:slug/:produto ──────────────────────────────────────────

export async function renderizarProduto(
  tenantId: string,
  lojaSlug: string,
  produtoSlug: string,
  base: string
): Promise<{ status: number; html: string }> {
  const template = await lerTemplate();

  let produto: Awaited<ReturnType<typeof produtoPublico>>;
  try {
    produto = await produtoPublico(tenantId, lojaSlug, produtoSlug);
  } catch {
    return { status: 404, html: naoEncontrado(template, base, 'Este produto não está mais no catálogo.') };
  }

  const { loja } = produto;
  const capa = produto.imagem_url || listaDeFotos(produto.imagens)[0] || null;
  const nomeCompleto = [produto.nome, produto.variacao, produto.tamanho].filter(Boolean).join(' · ');
  const title = `${nomeCompleto} — ${reais(produto.preco_vigente)} na ${loja.nome_fantasia} | Saúde PET Mercado`;
  const description = (
    produto.descricao ||
    `${nomeCompleto} por ${reais(produto.preco_vigente)} na ${loja.nome_fantasia}, ${loja.cidade}/${loja.estado}. Retirada no balcão${loja.aceita_entrega ? ' ou entrega' : ''}, pagamento por Pix ou cartão.`
  ).slice(0, 300);

  const canonical = `${base}/mercado/${loja.slug}/${produto.slug}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: nomeCompleto,
    description,
    image: capa ? [capa, ...listaDeFotos(produto.imagens).filter((foto) => foto !== capa)] : undefined,
    sku: produto.id,
    ...(produto.ean ? { gtin: produto.ean } : {}),
    ...(produto.marca ? { brand: { '@type': 'Brand', name: produto.marca } } : {}),
    category: produto.categoria?.nome || undefined,
    offers: {
      '@type': 'Offer',
      url: canonical,
      priceCurrency: 'BRL',
      price: produto.preco_vigente.toFixed(2),
      availability: produto.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: { '@type': 'PetStore', name: loja.nome_fantasia }
    }
  };

  const html = injectPageMetadata(template, {
    title,
    description,
    canonical,
    type: 'product',
    image: capa || loja.logo_url || `${base}/og-default.png`,
    jsonLd: [jsonLd, jsonLdDaLoja(loja, base)]
  });

  const corpo = [
    `<span class="server-kicker">${escapeHtml(loja.nome_fantasia)} · ${escapeHtml(loja.cidade)}</span>`,
    `<h1>${escapeHtml(nomeCompleto)}</h1>`,
    capa ? `<img src="${escapeHtml(capa)}" alt="${escapeHtml(produto.imagem_alt || nomeCompleto)}" title="${escapeHtml(nomeCompleto)}" />` : '',
    `<p class="server-excerpt">${reais(produto.preco_vigente)}${
      produto.preco_vigente < Number(produto.preco) ? ` <s>${reais(produto.preco)}</s>` : ''
    } · ${produto.disponivel ? 'disponível' : 'esgotado no momento'}${produto.exige_receita ? ' · exige receita veterinária' : ''}</p>`,
    produto.descricao ? `<p>${escapeHtml(produto.descricao)}</p>` : '',
    `<p class="server-meta">Vendido por <a href="/mercado/${escapeHtml(loja.slug)}">${escapeHtml(loja.nome_fantasia)}</a> — ${escapeHtml(enderecoDaLoja(loja))} · ${escapeHtml(loja.telefone)}</p>`,
    `<p><a href="/login?next=${encodeURIComponent(`/tutor/mercado/produto/${produto.id}`)}">Comprar pelo Saúde PET</a></p>`
  ].join('');

  return {
    status: 200,
    html: replaceRoot(html, `${snapshotStyles}<main data-server-content="mercado-produto">${corpo}</main>`)
  };
}
