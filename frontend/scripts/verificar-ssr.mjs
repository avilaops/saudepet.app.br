#!/usr/bin/env node
/**
 * Reprova o build quando uma página pública deixa de sair pronta do servidor.
 *
 * O backend carrega `dist-ssr/entry-server.cjs` para desenhar o HTML inicial
 * das páginas públicas com os mesmos `.tsx` do app. Se uma página passar a
 * depender de `window` na hora de desenhar, ou perder o `<Seo>`, nada quebra no
 * compilador: o site continua abrindo, só que o Google e a prévia de link do
 * WhatsApp voltam a receber página vazia. Em 01/09/2026 foi assim que 22 dos
 * 26 artigos ficaram em "descoberto, no momento não indexado".
 *
 * Aqui cada rota é desenhada com dados de exemplo, do jeito que o backend faz.
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'

// Como no backend em produção: o React de produção, sem os avisos de desenvolvimento.
process.env.NODE_ENV ||= 'production'

const require = createRequire(import.meta.url)
const arquivo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist-ssr/entry-server.cjs')
const { renderizar, ROTAS_DO_SERVIDOR } = require(arquivo)

const BASE = 'https://saudepet.app.br'
const falhas = []
const conferir = (condicao, mensagem) => { if (!condicao) falhas.push(mensagem) }

const artigo = {
  id: 'a1', slug: 'gato-parou-de-comer', title: 'Gato parou de comer', excerpt: 'Quanto tempo dá para esperar.',
  content: '## Sinais de alerta\n\nProcure um **veterinário**.\n\n<script>alert(1)</script>', cover_image: '/blog-media/gato.webp',
  cover_image_alt: 'Gato ao lado do pote', author_name: 'Equipe Saúde PET', published_at: '2026-08-18T12:00:00.000Z',
  updated_at: '2026-08-19T12:00:00.000Z', category: { id: 'c1', slug: 'sinais-de-alerta', name: 'Sinais de alerta' }
}
const loja = {
  id: 'l1', slug: 'casa-de-racoes', nome_fantasia: 'Casa de Rações', cidade: 'Curitiba', estado: 'PR', bairro: 'Centro',
  endereco: 'Rua A, 10', complemento: null, telefone: '(41) 3333-0000', whatsapp: null, descricao: null, logo_url: null,
  aceita_retirada: true, aceita_entrega: false, aceita_combinar: false, total_produtos: 1, latitude: -25.4, longitude: -49.2
}
const produto = {
  id: 'p1', slug: 'racao-15kg', nome: 'Ração <Premium>', variacao: 'Adultos', tamanho: '15 kg', marca: 'Golden', ean: '7890000000000',
  descricao: null, preco: '199.90', preco_vigente: 189.9, unidade: 'saco', imagem_url: null, imagens: [], exige_receita: false,
  disponivel: true, categoria: { id: 'k1', nome: 'Rações', slug: 'racoes' }
}

const casos = [
  { url: '/', dados: { '/v1/public/banners': { success: true, count: 0, banners: [] } }, contem: ['<h1', 'href="/blog"', 'href="/register"'] },
  { url: '/faq', dados: {}, contem: ['<h1'], jsonLd: 'FAQPage' },
  { url: '/contato', dados: {}, contem: ['<h1', '<form'] },
  { url: '/privacidade', dados: {}, contem: ['Política de Privacidade'] },
  {
    url: '/blog',
    dados: {
      '/public/blog?limit=9&page=1': { posts: [artigo], pagination: { page: 1, limit: 9, total: 20, pages: 3 } },
      '/public/blog/categories': { categories: [artigo.category] }
    },
    // O link de cada artigo e o da página seguinte são o caminho de entrada do Google.
    contem: ['href="/blog/gato-parou-de-comer"', 'Quanto tempo dá para esperar.', 'href="/blog?page=2"'],
    naoContem: ['Carregando artigos']
  },
  {
    url: '/blog/gato-parou-de-comer',
    dados: { '/public/blog/gato-parou-de-comer': { post: artigo, related: [] } },
    contem: ['<h1>Gato parou de comer</h1>', '<h2>Sinais de alerta</h2>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
    naoContem: ['<script>alert(1)</script>', 'Carregando artigo'],
    jsonLd: 'Article'
  },
  {
    url: '/blog/nao-existe',
    dados: { '/public/blog/nao-existe': { __naoEncontrado: true } },
    contem: ['Artigo não encontrado'],
    noindex: true
  },
  { url: '/mercado', dados: { '/public/mercado/lojas': { lojas: [loja] } }, contem: ['href="/mercado/casa-de-racoes"'], jsonLd: 'ItemList' },
  {
    url: '/mercado/casa-de-racoes',
    dados: {
      '/public/mercado/lojas/casa-de-racoes': { loja, categorias: [] },
      '/public/mercado/lojas/casa-de-racoes/produtos?limite=24&pagina=1': { produtos: [produto], total: 30, pagina: 1, paginas: 2 }
    },
    contem: ['Casa de Rações', 'href="/mercado/casa-de-racoes/racao-15kg"', 'href="/mercado/casa-de-racoes?pagina=2"'],
    jsonLd: 'PetStore'
  },
  {
    url: '/mercado/casa-de-racoes/racao-15kg',
    dados: { '/public/mercado/lojas/casa-de-racoes/produtos/racao-15kg': { produto: { ...produto, loja } } },
    contem: ['Ração &lt;Premium&gt;', '189,90'],
    naoContem: ['Ração <Premium>'],
    jsonLd: 'Product'
  },
  {
    url: '/mercado/casa-de-racoes/sumiu',
    dados: { '/public/mercado/lojas/casa-de-racoes/produtos/sumiu': { __naoEncontrado: true } },
    contem: ['Produto não encontrado'],
    noindex: true
  }
]

for (const caso of casos) {
  let pagina
  try {
    pagina = renderizar(caso.url, JSON.parse(JSON.stringify(caso.dados)), { baseDoSite: BASE })
  } catch (erro) {
    falhas.push(`${caso.url}: não desenhou no servidor — ${erro?.stack || erro}`)
    continue
  }
  const { html, seo } = pagina
  conferir(html.length > 500, `${caso.url}: HTML vazio`)
  conferir(html.includes('id="conteudo"'), `${caso.url}: saiu sem o layout público`)
  conferir(Boolean(seo?.title && seo?.description && seo?.path), `${caso.url}: a página não declarou <Seo> completo`)
  for (const trecho of caso.contem || []) conferir(html.includes(trecho), `${caso.url}: faltou no HTML: ${trecho}`)
  for (const trecho of caso.naoContem || []) conferir(!html.includes(trecho), `${caso.url}: não deveria ter no HTML: ${trecho}`)
  if (caso.jsonLd) conferir(JSON.stringify(seo?.jsonLd || '').includes(`"@type":"${caso.jsonLd}"`), `${caso.url}: faltou JSON-LD ${caso.jsonLd}`)
  conferir(Boolean(seo?.noindex) === Boolean(caso.noindex), `${caso.url}: noindex deveria ser ${Boolean(caso.noindex)}`)
}

// Toda rota declarada no servidor tem pelo menos um caso aqui.
const cobre = (rota) => casos.some((caso) => new RegExp(`^${rota.replace(/:[^/]+/g, '[^/]+')}$`).test(caso.url))
for (const rota of ROTAS_DO_SERVIDOR) conferir(cobre(rota), `${rota}: rota do servidor sem caso de verificação`)

// O `App.tsx` carrega o código destas páginas antes de hidratar; a lista de lá
// tem de ser a mesma daqui, senão a página volta a piscar ao abrir.
const appTsx = fs.readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/App.tsx'), 'utf8')
const blocoDoApp = appTsx.slice(appTsx.indexOf('const PAGINAS_DO_SERVIDOR'), appTsx.indexOf('export async function preCarregarPaginaDoServidor'))
const rotasDoApp = [...blocoDoApp.matchAll(/\['([^']+)',/g)].map((achado) => achado[1])
conferir(
  JSON.stringify([...rotasDoApp].sort()) === JSON.stringify([...ROTAS_DO_SERVIDOR].sort()),
  `PAGINAS_DO_SERVIDOR (App.tsx) e ROTAS_DO_SERVIDOR (entry-server.tsx) divergem: ${rotasDoApp.join(' ')} × ${ROTAS_DO_SERVIDOR.join(' ')}`
)

if (falhas.length) {
  console.error(`\n✖ Páginas públicas no servidor: ${falhas.length} problema(s)\n`)
  for (const falha of falhas) console.error(`  - ${falha}`)
  process.exit(1)
}
console.log(`✔ Páginas públicas no servidor: ${casos.length} casos desenhados com os .tsx do app`)
