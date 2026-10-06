import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AdminContentNav from '../../components/admin/AdminContentNav'
import { Aviso, Campo, Painel, StatusPill, botaoPrimario, botaoSecundario, entrada } from '../../components/admin/AdminUI'
import api from '../../services/api'

export default function AdminBlog() {
  const [posts, setPosts] = useState<ApiPayload[]>([])
  const [categories, setCategories] = useState<ApiPayload[]>([])
  const [category, setCategory] = useState<ApiPayload>({ name: '', slug: '' })
  const [error, setError] = useState('')

  const load = () =>
    Promise.all([
      api.get('/admin/content/blog/posts', { params: { page: 1, limit: 100 } }),
      api.get('/admin/content/blog/categories'),
    ]).then(([p, c]) => {
      setPosts(p.data.posts)
      setCategories(c.data.categories)
      setError('')
    })

  useEffect(() => {
    load().catch(() => setError('Não foi possível carregar os artigos e categorias.'))
  }, [])

  const removePost = async (post: ApiPayload) => {
    if (!window.confirm(`Excluir o artigo “${post.title}”?`)) return
    try {
      await api.delete(`/admin/content/blog/posts/${post.id}`)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível excluir o artigo.')
    }
  }

  const addCategory = async (e: any) => {
    e.preventDefault()
    try {
      await api.post('/admin/content/blog/categories', category)
      setCategory({ name: '', slug: '' })
      await load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível adicionar a categoria.')
    }
  }

  const removeCategory = async (item: ApiPayload) => {
    if (!window.confirm(`Excluir a categoria “${item.name}”?`)) return
    try {
      await api.delete(`/admin/content/blog/categories/${item.id}`)
      await load()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Não foi possível excluir a categoria.')
    }
  }

  return (
    <div>
      <AdminContentNav
        title="Blog"
        subtitle="Artigos publicados, agendados e em rascunho, com as categorias do site."
        actions={<Link className={botaoPrimario} to="/admin/blog/novo">Novo artigo</Link>}
      />

      <div className="space-y-6">
        {error && <Aviso>{error}</Aviso>}

        <Painel titulo="Artigos">
          {posts.length ? (
            <div className="divide-y divide-slate-100">
              {posts.map((post) => (
                <article key={post.id} className="flex flex-col justify-between gap-4 py-4 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <StatusPill status={post.status} />
                    <h3 className="mt-2 truncate text-sm font-black text-slate-900">{post.title}</h3>
                    <small className="text-[11px] text-slate-400">
                      Atualizado em {new Date(post.updated_at).toLocaleString('pt-BR')}
                    </small>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Link to={`/admin/blog/${post.id}/editar`} className={botaoSecundario}>Editar</Link>
                    <button
                      className="inline-flex items-center rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100"
                      onClick={() => removePost(post)}
                    >
                      Excluir
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-xs font-medium text-slate-400">Nenhum artigo criado.</p>
          )}
        </Painel>

        <Painel titulo="Categorias">
          <form className="flex flex-col items-end gap-3 sm:flex-row" onSubmit={addCategory}>
            <Campo rotulo="Nome" className="w-full sm:flex-1">
              <input
                value={category.name}
                onChange={(e) => setCategory({ ...category, name: e.target.value })}
                required
                className={entrada}
              />
            </Campo>
            <Campo rotulo="Slug" className="w-full sm:flex-1">
              <input
                value={category.slug}
                onChange={(e) => setCategory({ ...category, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })}
                required
                className={entrada}
              />
            </Campo>
            <button className={`${botaoPrimario} w-full sm:w-auto`}>Adicionar</button>
          </form>

          <ul className="mt-5 divide-y divide-slate-100">
            {categories.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                <span className="font-bold text-slate-700">
                  {item.name} <small className="font-medium text-slate-400">({item._count.posts})</small>
                </span>
                <button
                  disabled={item._count.posts > 0}
                  onClick={() => removeCategory(item)}
                  className={`${botaoSecundario} py-1.5`}
                >
                  Excluir
                </button>
              </li>
            ))}
          </ul>
        </Painel>
      </div>
    </div>
  )
}
