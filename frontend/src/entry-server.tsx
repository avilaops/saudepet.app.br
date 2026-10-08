import { Suspense } from 'react'
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import { Routes, Route } from 'react-router-dom'
import PublicHome from './pages/public/PublicHome'
import FaqPage from './pages/public/FaqPage'
import ContatoPage from './pages/public/ContatoPage'
import BlogPage from './pages/public/BlogPage'
import BlogPostPage from './pages/public/BlogPostPage'
import PrivacyPage from './pages/public/PrivacyPage'
import PublicMercado from './pages/public/PublicMercado'
import PublicMercadoLoja from './pages/public/PublicMercadoLoja'
import PublicMercadoProduto from './pages/public/PublicMercadoProduto'
import { ProvedorDeDadosIniciais, type DadosIniciais } from './ssr/dadosIniciais'
import { ColetorDeSeo, type SeoDaPagina } from './ssr/seo'
import { definirBaseDoSite } from './ssr/site'

/**
 * As páginas públicas desenhadas no servidor — com os mesmos `.tsx` do app.
 *
 * Até 08/10/2026 o backend escrevia à mão um HTML resumido de cada página
 * pública (`blog-render.service`, `mercado-render.service`): toda página
 * existia duas vezes, e as duas versões divergiam. Agora o backend carrega
 * este arquivo compilado (`dist-ssr/entry-server.cjs`), entrega os dados que a
 * página pediria à API e recebe de volta o HTML da página de verdade e o que
 * ela declarou no `<Seo>`.
 *
 * Só entram aqui as rotas que o nginx manda para `/api/public/render/...`.
 * Os caminhos têm de ser os mesmos do `App.tsx`: é ele que assume no
 * navegador. A árvore também espelha a de lá (um `Suspense` em volta das
 * rotas), para o React aproveitar o HTML em vez de redesenhar.
 */
export const ROTAS_DO_SERVIDOR = [
  '/',
  '/faq',
  '/contato',
  '/blog',
  '/blog/:slug',
  '/privacidade',
  '/mercado',
  '/mercado/:slug',
  '/mercado/:slug/:produto'
]

export interface PaginaDesenhada {
  html: string
  seo: SeoDaPagina | null
}

export function renderizar(url: string, dados: DadosIniciais = {}, opcoes: { baseDoSite?: string } = {}): PaginaDesenhada {
  if (opcoes.baseDoSite) definirBaseDoSite(opcoes.baseDoSite)
  const coletor: { seo: SeoDaPagina | null } = { seo: null }
  const html = renderToString(
    <StaticRouter location={url}>
      <ProvedorDeDadosIniciais dados={dados}>
        <ColetorDeSeo.Provider value={coletor}>
          <Suspense fallback={null}>
            <Routes>
              <Route path="/" element={<PublicHome />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/contato" element={<ContatoPage />} />
              <Route path="/blog" element={<BlogPage />} />
              <Route path="/blog/:slug" element={<BlogPostPage />} />
              <Route path="/privacidade" element={<PrivacyPage />} />
              <Route path="/mercado" element={<PublicMercado />} />
              <Route path="/mercado/:slug" element={<PublicMercadoLoja />} />
              <Route path="/mercado/:slug/:produto" element={<PublicMercadoProduto />} />
            </Routes>
          </Suspense>
        </ColetorDeSeo.Provider>
      </ProvedorDeDadosIniciais>
    </StaticRouter>
  )
  return { html, seo: coletor.seo }
}
