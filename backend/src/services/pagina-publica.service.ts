import fs from 'fs/promises';
import path from 'path';
import { absoluteUrl, escapeHtml, injectPageMetadata } from './blog-render.service';

/**
 * O HTML das páginas públicas, desenhado com os `.tsx` do próprio app.
 *
 * Até 08/10/2026 este backend escrevia à mão um resumo de cada página pública
 * (`renderBlogHtml`, `renderStaticPageHtml`, `mercado-render.service`). Toda
 * página existia duas vezes — o `.tsx` que a pessoa via e o HTML que o Google
 * lia — e as duas divergiam em título, texto e dados estruturados.
 *
 * Agora há uma versão só. O frontend compila `entry-server.tsx` para
 * `entry-server.cjs`; aqui a gente:
 *
 *   1. junta as respostas da API que a página pediria (`dados`);
 *   2. pede ao `.tsx` o HTML do corpo e o que ele declarou no `<Seo>`;
 *   3. escreve título, descrição, Open Graph e JSON-LD no `<head>` e manda os
 *      dados junto, para o React assumir a tela sem buscar tudo de novo.
 *
 * Se o desenho falhar (arquivo ausente, erro numa página), sai o `index.html`
 * puro: a pessoa vê a página normalmente, montada no navegador, e só o HTML
 * inicial fica sem conteúdo. Página pública no ar vale mais que SEO perfeito.
 */

export type DadosIniciais = Record<string, unknown>;

/** O que o `.tsx` entende como "o servidor procurou e não existe". */
export const NAO_ENCONTRADO = { __naoEncontrado: true } as const;

interface SeoDaPagina {
  title: string;
  description: string;
  path: string;
  image?: string;
  imageWidth?: string;
  imageHeight?: string;
  imageType?: string;
  type?: string;
  jsonLd?: unknown;
  noindex?: boolean;
}

interface DesenhoDoServidor {
  renderizar(url: string, dados: DadosIniciais, opcoes: { baseDoSite: string }): { html: string; seo: SeoDaPagina | null };
}

/**
 * Mesma regra de `chaveDoDado` em `frontend/src/ssr/dadosIniciais.tsx`:
 * `/public/blog` + `{ page: 1, limit: 9 }` → `/public/blog?limit=9&page=1`.
 * A página procura o dado por esta chave; mudou lá, muda aqui.
 */
export function chaveDoDado(caminho: string, parametros?: Record<string, unknown>): string {
  const pares = Object.entries(parametros || {})
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([nome, valor]) => `${nome}=${String(valor)}`)
    .sort();
  return pares.length ? `${caminho}?${pares.join('&')}` : caminho;
}

// ── index.html do frontend ───────────────────────────────────────────────────

const VALIDADE_DO_TEMPLATE_MS = 30_000;
let templateEmCache: { html: string; ate: number } | null = null;

/**
 * Onde buscar o `index.html`. Em produção, no contêiner `web`: é ele quem
 * serve os arquivos `/assets/...`, então só o `index.html` dele aponta para
 * arquivos que existem. A cópia que vai dentro da imagem do backend fica velha
 * no primeiro deploy só do web — em 08/10/2026 isso deixou as 142 páginas
 * públicas pedindo três JavaScript que davam 404.
 */
function enderecoDoTemplate(): string | null {
  const configurado = process.env.FRONTEND_TEMPLATE_URL;
  if (configurado === 'off') return null;
  if (configurado) return configurado;
  return process.env.NODE_ENV === 'production' ? 'http://web/index.html' : null;
}

async function templateDoArquivo(): Promise<string> {
  const candidatos = [
    process.env.FRONTEND_INDEX_PATH,
    '/usr/share/nginx/html/index.html',
    path.resolve(__dirname, '../../../frontend/dist/index.html')
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

export async function lerTemplate(): Promise<string> {
  if (templateEmCache && templateEmCache.ate > Date.now()) return templateEmCache.html;
  let html: string | null = null;
  const endereco = enderecoDoTemplate();
  if (endereco) {
    try {
      const resposta = await fetch(endereco, { signal: AbortSignal.timeout(2000) });
      const corpo = resposta.ok ? await resposta.text() : '';
      if (corpo.includes('<div id="root"></div>')) html = corpo;
    } catch {
      // Web fora do ar ou reiniciando: vale a cópia que veio na imagem.
    }
  }
  if (!html) html = await templateDoArquivo();
  templateEmCache = { html, ate: Date.now() + VALIDADE_DO_TEMPLATE_MS };
  return html;
}

// ── entry-server.cjs ─────────────────────────────────────────────────────────

let desenho: DesenhoDoServidor | null | undefined;

function carregarDesenho(): DesenhoDoServidor | null {
  if (desenho !== undefined) return desenho;
  // Na imagem o arquivo fica em `/app/ssr`; fora dela, no build local do frontend.
  const candidatos = process.env.SSR_BUNDLE_PATH
    ? [process.env.SSR_BUNDLE_PATH]
    : ['/app/ssr/entry-server.cjs', path.resolve(__dirname, '../../../frontend/dist-ssr/entry-server.cjs')];
  desenho = null;
  for (const candidato of candidatos) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const modulo = require(candidato) as Partial<DesenhoDoServidor>;
      if (typeof modulo.renderizar === 'function') {
        desenho = modulo as DesenhoDoServidor;
        break;
      }
    } catch (erro) {
      const codigo = (erro as NodeJS.ErrnoException)?.code;
      if (codigo !== 'MODULE_NOT_FOUND' && codigo !== 'ENOENT') {
        console.error(`[pagina-publica] falha ao carregar ${candidato}:`, erro);
      }
    }
  }
  if (!desenho) console.error('[pagina-publica] entry-server.cjs não encontrado: páginas públicas saem sem HTML inicial.');
  return desenho;
}

/** Só para teste: esquece o que foi carregado. */
export function esquecerCaches(): void {
  desenho = undefined;
  templateEmCache = null;
}

// ── montagem ─────────────────────────────────────────────────────────────────

function substituirMeta(html: string, propriedade: string, conteudo: string): string {
  const padrao = new RegExp(`<meta\\s+property=["']${propriedade}["'][^>]*>`, 'i');
  const tag = `<meta property="${propriedade}" content="${escapeHtml(conteudo)}" />`;
  return padrao.test(html) ? html.replace(padrao, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function aplicarSeo(template: string, seo: SeoDaPagina, base: string): string {
  const canonical = `${base}${seo.path === '/' ? '/' : seo.path}`;
  // Página sem dados estruturados próprios leva ao menos o vínculo com o site.
  const jsonLd = seo.jsonLd ?? {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: seo.title,
    description: seo.description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Saúde PET', url: base }
  };
  let html = injectPageMetadata(template, {
    title: seo.title,
    description: seo.description,
    canonical,
    type: seo.type || 'website',
    image: absoluteUrl(base, seo.image),
    jsonLd,
    robots: seo.noindex ? 'noindex,nofollow' : 'index,follow'
  });
  if (seo.imageWidth) html = substituirMeta(html, 'og:image:width', seo.imageWidth);
  if (seo.imageHeight) html = substituirMeta(html, 'og:image:height', seo.imageHeight);
  if (seo.imageType) html = substituirMeta(html, 'og:image:type', seo.imageType);
  return html;
}

export interface PedidoDePagina {
  /** Caminho que a pessoa abriu, com a query que a página lê (`/blog?page=2`). */
  url: string;
  /** Respostas da API que a página pediria, por `chaveDoDado`. */
  dados?: DadosIniciais;
  /** Tags extras para o `<head>` (preload da imagem principal, por exemplo). */
  dicasDoHead?: string[];
  baseDoSite: string;
}

export async function montarPaginaPublica({ url, dados = {}, dicasDoHead = [], baseDoSite }: PedidoDePagina): Promise<string> {
  const template = await lerTemplate();
  const base = baseDoSite.replace(/\/$/, '');
  const servidor = carregarDesenho();
  if (!servidor) return template;

  // Ida e volta pelo JSON: o `.tsx` precisa receber no servidor exatamente o
  // que vai receber no navegador (datas como texto, decimais como texto).
  const texto = JSON.stringify(dados);
  let pagina: { html: string; seo: SeoDaPagina | null };
  try {
    pagina = servidor.renderizar(url, JSON.parse(texto) as DadosIniciais, { baseDoSite: base });
  } catch (erro) {
    console.error(`[pagina-publica] falha ao desenhar ${url}:`, erro);
    return template;
  }

  let html = pagina.seo ? aplicarSeo(template, pagina.seo, base) : template;
  if (dicasDoHead.length) html = html.replace('</head>', `    ${dicasDoHead.join('\n    ')}\n  </head>`);
  // `data-ssr` avisa o `main.tsx` para aproveitar este HTML em vez de redesenhar.
  html = html.replace('<div id="root"></div>', () => `<div id="root" data-ssr="1">${pagina.html}</div>`);
  const script = `<script id="dados-iniciais" type="application/json">${texto.replace(/</g, '\\u003c')}</script>`;
  return html.replace('</body>', () => `  ${script}\n  </body>`);
}
