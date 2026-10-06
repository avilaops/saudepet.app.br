import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'
import { responsiveBlogImageSet } from '../../utils/blogImages'

export default function BlogPage() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<ApiPayload>({ posts: [], pagination: {} })
  const [categories, setCategories] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const search = params.get('search') || ''
  const category = params.get('category') || ''
  const page = Number(params.get('page') || 1)
  useEffect(() => {
    setLoading(true)
    setErro('')
    // Resposta de uma busca antiga não pode pisar na mais nova.
    let vigente = true
    // A busca dispara a cada tecla; sem a espera, digitar uma palavra gastava
    // uma dúzia de requisições do limite do visitante anônimo.
    const espera = setTimeout(() => {
      // Posts e categorias independentes: a falha de um não zera o outro, e
      // falha de rede vira erro visível em vez de "Nenhum artigo publicado".
      api.get('/public/blog', { params: { search: search || undefined, category: category || undefined, page, limit: 9 } })
        .then((posts) => { if (vigente) setData(posts.data) })
        .catch((e) => {
          if (!vigente) return
          setData({ posts: [], pagination: {} })
          // O 429 já chega dizendo em quantos minutos passa; repetir isso vale
          // mais do que mandar recarregar, que só gasta mais do limite.
          setErro(e?.response?.data?.error || 'Não foi possível carregar os artigos agora. Recarregue a página para tentar de novo.')
        })
        .finally(() => { if (vigente) setLoading(false) })
    }, search ? 350 : 0)
    return () => { vigente = false; clearTimeout(espera) }
  }, [search, category, page])
  useEffect(() => {
    api.get('/public/blog/categories')
      .then((cats) => setCategories(cats.data?.categories || []))
      .catch(() => {})
  }, [])
  const update = (key: ApiPayload, value: ApiPayload) => { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); if (key !== 'page') next.delete('page'); setParams(next) }
  return (
    <PublicLayout>
      <Seo title="Blog de saúde e cuidados com pets | Saúde PET" description="Conteúdos do Saúde PET sobre cuidado, prevenção e rotina de animais de estimação." path="/blog" />
      <section className="page-hero"><div className="public-wrap"><span className="eyebrow">Conteúdo para tutores</span><h1>Blog Saúde PET</h1><p>Informação clara para apoiar decisões mais conscientes sobre o cuidado do seu pet.</p><div className="blog-filters"><label><span>Buscar artigos</span><input type="search" value={search} onChange={(e) => update('search', e.target.value)} placeholder="Digite um tema" /></label><label><span>Categoria</span><select value={category} onChange={(e) => update('category', e.target.value)}><option value="">Todas</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></label></div></div></section>
      <section className="public-section"><div className="public-wrap">{erro && <p className="lv-warning-box" role="alert">{erro}</p>}
        {loading ? <div className="blog-loading" role="status"><span className="loading-line" /><span className="loading-line" /><span className="loading-line" /><span className="sr-only">Carregando artigos…</span></div> : data.posts.length ? <><div className="post-grid">{data.posts.map((post: ApiPayload, index: number) => <article className={index === 0 && page === 1 ? 'post-card featured' : 'post-card'} key={post.id}>{post.cover_image ? <img src={post.cover_image} srcSet={responsiveBlogImageSet(post.cover_image)} sizes={index === 0 && page === 1 ? '(min-width: 901px) 40vw, (min-width: 621px) 50vw, calc(100vw - 28px)' : '(min-width: 901px) 30vw, (min-width: 621px) 50vw, calc(100vw - 28px)'} alt={post.cover_image_alt || ''} width="1280" height="853" loading={index === 0 && page === 1 ? 'eager' : 'lazy'} fetchPriority={index === 0 && page === 1 ? 'high' : 'auto'} decoding="async" /> : <div className="post-placeholder" aria-hidden="true"><img src="/brand/logo-symbol.png" alt="" /></div>}<div><span className="post-category">{post.category?.name || 'Saúde PET'}</span><h2><Link to={`/blog/${post.slug}`}>{post.title}</Link></h2><p>{post.excerpt}</p><small>{post.author_name} · {post.reading_time_minutes || 1} min de leitura</small></div></article>)}</div>{data.pagination.pages > 1 && <nav className="pagination" aria-label="Paginação"><button disabled={page <= 1} onClick={() => update('page', page - 1)}>Anterior</button><span>Página {page} de {data.pagination.pages}</span><button disabled={page >= data.pagination.pages} onClick={() => update('page', page + 1)}>Próxima</button></nav>}</> : erro ? null : <div className="empty-state"><h2>Nenhum artigo publicado</h2><p>Novos conteúdos aparecerão aqui assim que forem revisados e publicados.</p></div>}</div></section>
    </PublicLayout>
  )
}
