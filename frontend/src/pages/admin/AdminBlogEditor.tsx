import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AdminContentNav from '../../components/admin/AdminContentNav'
import { Aviso, Campo, botaoPrimario, botaoSecundario, entrada } from '../../components/admin/AdminUI'
import SafeMarkdown from '../../components/public/SafeMarkdown'
import api from '../../services/api'

const blank = {
  slug: '', title: '', excerpt: '', content: '', coverImage: '', coverImageAlt: '', authorName: '',
  categoryId: '', tags: '', status: 'rascunho', seoTitle: '', seoDescription: '', socialImage: '', scheduledFor: '',
}

export default function AdminBlogEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const editing = Boolean(id)
  const [form, setForm] = useState(blank)
  const [categories, setCategories] = useState<ApiPayload[]>([])
  const [preview, setPreview] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const [postLoaded, setPostLoaded] = useState(!id)
  const [saving, setSaving] = useState(false)
  const [enviandoCapa, setEnviandoCapa] = useState(false)

  const enviarCapa = async (evento: any) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return
    setEnviandoCapa(true)
    try {
      const dados = new FormData()
      dados.append('imagem', arquivo)
      const { data } = await api.post('/admin/content/blog/imagem', dados, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setForm((atual) => ({ ...atual, coverImage: data.url }))
      setMessage('Imagem de capa enviada.')
    } catch (erro: any) {
      setMessage(erro.response?.data?.error || 'Não foi possível enviar a imagem.')
    } finally {
      setEnviandoCapa(false)
    }
  }

  useEffect(() => {
    api.get('/admin/content/blog/categories')
      .then((r) => setCategories(r.data.categories))
      .catch(() => setLoadError('Não foi possível carregar as categorias.'))
    if (editing) {
      api.get(`/admin/content/blog/posts/${id}`)
        .then((r) => {
          const p = r.data.post
          setForm({
            slug: p.slug,
            title: p.title,
            excerpt: p.excerpt,
            content: p.content,
            coverImage: p.cover_image || '',
            coverImageAlt: p.cover_image_alt || '',
            authorName: p.author_name,
            categoryId: p.category_id || '',
            tags: p.tags.join(', '),
            status: p.status,
            seoTitle: p.seo_title || '',
            seoDescription: p.seo_description || '',
            socialImage: p.social_image || '',
            scheduledFor: p.scheduled_for ? new Date(p.scheduled_for).toISOString().slice(0, 16) : '',
          })
          setPostLoaded(true)
        })
        .catch(() => setLoadError('Não foi possível carregar o artigo. Recarregue a página antes de editar — salvar agora sobrescreveria o conteúdo.'))
    }
  }, [editing, id])

  const change = (e: any) => setForm({ ...form, [e.target.name]: e.target.value })

  const titleChange = (e: any) => setForm({
    ...form,
    title: e.target.value,
    ...(!editing || !form.slug
      ? { slug: e.target.value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
      : {}),
  })

  const save = async (e: any) => {
    e.preventDefault()
    if (editing && !postLoaded) {
      setMessage('O artigo em edição não foi carregado — recarregue a página antes de salvar.')
      return
    }
    setSaving(true)
    setMessage('Salvando…')
    const payload = {
      ...form,
      categoryId: form.categoryId || null,
      tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      scheduledFor: form.status === 'agendado' && form.scheduledFor ? new Date(form.scheduledFor).toISOString() : null,
    }
    try {
      editing
        ? await api.put(`/admin/content/blog/posts/${id}`, payload)
        : await api.post('/admin/content/blog/posts', payload)
      navigate('/admin/blog')
    } catch (error: any) {
      setMessage(
        error.response?.data?.details?.map((d: ApiPayload) => d.message).join('. ')
        || error.response?.data?.error
        || 'Não foi possível salvar.'
      )
    } finally {
      setSaving(false)
    }
  }

  const publishThreads = async () => {
    setMessage('Publicando no Threads…')
    try {
      await api.post(`/admin/content/blog/posts/${id}/publicar-threads`)
      setMessage('Publicado no Threads!')
    } catch (error: any) {
      setMessage(error.response?.data?.error || 'Não foi possível publicar no Threads.')
    }
  }

  return (
    <div>
      <AdminContentNav
        title={editing ? 'Editar artigo' : 'Novo artigo'}
        actions={
          <button onClick={() => setPreview(!preview)} className={botaoSecundario}>
            {preview ? 'Voltar ao editor' : 'Visualizar prévia'}
          </button>
        }
      />

      <div className="space-y-6">
        {loadError && <Aviso>{loadError}</Aviso>}

        {preview ? (
          <article className="mx-auto max-w-[820px] rounded-2xl border border-slate-200/80 bg-white p-8 shadow-sm">
            <span className="text-xs font-extrabold uppercase tracking-wider text-teal-600">Prévia não indexada</span>
            <h1 className="my-4 text-4xl font-black leading-tight text-slate-900">{form.title || 'Título do artigo'}</h1>
            <p className="text-sm text-slate-500">{form.excerpt}</p>
            {form.coverImage && (
              <img src={form.coverImage} alt={form.coverImageAlt} className="my-6 max-h-[480px] w-full rounded-2xl object-cover" />
            )}
            <div className="prose-slate mt-6 text-sm leading-relaxed text-slate-700">
              <SafeMarkdown content={form.content} />
            </div>
          </article>
        ) : (
          <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]" onSubmit={save}>
            <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Campo rotulo="Título">
                <input name="title" value={form.title} onChange={titleChange} required className={entrada} />
              </Campo>
              <Campo rotulo="Slug">
                <input
                  name="slug"
                  value={form.slug}
                  onChange={change}
                  pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
                  required
                  className={entrada}
                />
              </Campo>
              <Campo rotulo="Resumo">
                <textarea name="excerpt" value={form.excerpt} onChange={change} rows={3} required className={entrada} />
              </Campo>
              <Campo rotulo="Conteúdo em Markdown seguro">
                <textarea
                  name="content"
                  value={form.content}
                  onChange={change}
                  rows={22}
                  required
                  placeholder={'## Subtítulo\n\nTexto do artigo.\n\n- Item de lista'}
                  className={`${entrada} font-mono leading-relaxed`}
                />
              </Campo>

              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Imagem de capa">
                  <div className="flex gap-2">
                    <input name="coverImage" value={form.coverImage} onChange={change} type="url" placeholder="Cole uma URL ou envie um arquivo" className={entrada} />
                    <label className="shrink-0 cursor-pointer inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200">
                      {enviandoCapa ? 'Enviando…' : 'Enviar'}
                      <input
                        type="file"
                        hidden
                        accept="image/*"
                        disabled={enviandoCapa}
                        onChange={enviarCapa}
                      />
                    </label>
                  </div>
                </Campo>
                <Campo rotulo="Texto alternativo">
                  <input name="coverImageAlt" value={form.coverImageAlt} onChange={change} className={entrada} />
                </Campo>
                <Campo rotulo="Imagem social (URL)">
                  <input name="socialImage" value={form.socialImage} onChange={change} type="url" className={entrada} />
                </Campo>
                <Campo rotulo="Tags, separadas por vírgula">
                  <input name="tags" value={form.tags} onChange={change} className={entrada} />
                </Campo>
              </div>

              <fieldset className="space-y-4 rounded-2xl border border-slate-200 p-5">
                <legend className="px-1.5 text-[11px] font-black uppercase tracking-wider text-slate-500">SEO</legend>
                <Campo rotulo="Título SEO">
                  <input name="seoTitle" value={form.seoTitle} onChange={change} maxLength={70} className={entrada} />
                </Campo>
                <Campo rotulo="Descrição SEO">
                  <textarea
                    name="seoDescription"
                    value={form.seoDescription}
                    onChange={change}
                    maxLength={170}
                    rows={3}
                    className={entrada}
                  />
                </Campo>
              </fieldset>
            </div>

            <aside className="h-max space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:sticky lg:top-28">
              <Campo rotulo="Autor">
                <input name="authorName" value={form.authorName} onChange={change} required className={entrada} />
              </Campo>
              <Campo rotulo="Categoria">
                <select name="categoryId" value={form.categoryId} onChange={change} className={entrada}>
                  <option value="">Sem categoria</option>
                  {categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </Campo>
              <Campo rotulo="Status">
                <select name="status" value={form.status} onChange={change} className={entrada}>
                  <option value="rascunho">Rascunho</option>
                  <option value="agendado">Agendado</option>
                  <option value="publicado">Publicado</option>
                </select>
              </Campo>
              {form.status === 'agendado' && (
                <Campo rotulo="Publicar em">
                  <input
                    type="datetime-local"
                    name="scheduledFor"
                    value={form.scheduledFor}
                    onChange={change}
                    required
                    className={entrada}
                  />
                </Campo>
              )}
              <p className="text-[11px] leading-relaxed text-slate-400">
                Artigos em rascunho ou agendados para o futuro não aparecem no site nem no sitemap.
              </p>
              <button className={`${botaoPrimario} w-full`} disabled={saving || (editing && !postLoaded)}>
                {saving ? 'Salvando…' : 'Salvar artigo'}
              </button>
              {editing && form.status === 'publicado' && (
                <button type="button" className={`${botaoSecundario} w-full`} onClick={publishThreads}>
                  Publicar no Threads
                </button>
              )}
              {message && <p role="status" className="text-[11px] font-bold text-slate-500">{message}</p>}
            </aside>
          </form>
        )}
      </div>
    </div>
  )
}
