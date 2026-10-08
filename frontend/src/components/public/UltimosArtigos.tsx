import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { chaveDoDado, useDadosIniciais } from '../../ssr/dadosIniciais'
import { responsiveBlogImageSet } from '../../utils/blogImages'

/** Quantos artigos a home mostra; o backend manda o mesmo número junto com o HTML. */
export const ARTIGOS_NA_HOME = 3

/**
 * Os artigos mais recentes do blog, na página inicial.
 *
 * A home é a página mais visitada e a que o Google mais revisita; sem esta
 * seção ela só apontava para o blog pelo menu, e cada artigo novo dependia de
 * alguém abrir a listagem para ganhar um caminho de entrada. Blog vazio (ou
 * API fora do ar) não desenha nada: seção de "em breve" seria promessa.
 */
export default function UltimosArtigos() {
  const pronto = useDadosIniciais()<ApiPayload>(chaveDoDado('/public/blog', { page: 1, limit: ARTIGOS_NA_HOME }))
  const [artigos, setArtigos] = useState<ApiPayload[]>(pronto.dado?.posts || [])

  useEffect(() => {
    if (pronto.veioPronto) return
    let vigente = true
    api.get('/public/blog', { params: { page: 1, limit: ARTIGOS_NA_HOME } })
      .then((resposta) => { if (vigente) setArtigos(resposta.data?.posts || []) })
      .catch(() => {})
    return () => { vigente = false }
  }, [])

  if (!artigos.length) return null

  return (
    <section id="blog" className="lv-section">
      <div className="lv-container">
        <div className="lv-section-header">
          <span className="lv-tag">DO NOSSO BLOG</span>
          <h2>Para cuidar melhor do seu pet</h2>
          <p>Conteúdo revisado sobre prevenção, sinais de alerta e rotina de cães e gatos.</p>
        </div>
        <div className="post-grid">
          {artigos.map((artigo) => (
            <article className="post-card" key={artigo.id || artigo.slug}>
              {artigo.cover_image
                ? <img src={artigo.cover_image} srcSet={responsiveBlogImageSet(artigo.cover_image)} sizes="(min-width: 901px) 30vw, (min-width: 621px) 50vw, calc(100vw - 28px)" alt={artigo.cover_image_alt || ''} width="1280" height="853" loading="lazy" decoding="async" />
                : <div className="post-placeholder" aria-hidden="true"><img src="/brand/logo-symbol.png" alt="" /></div>}
              <div>
                <span className="post-category">{artigo.category?.name || 'Saúde PET'}</span>
                <h3><Link to={`/blog/${artigo.slug}`}>{artigo.title}</Link></h3>
                <p>{artigo.excerpt}</p>
                <small>{artigo.author_name} · {artigo.reading_time_minutes || 1} min de leitura</small>
              </div>
            </article>
          ))}
        </div>
        <p style={{ textAlign: 'center', marginTop: 28 }}>
          <Link className="lv-btn lv-btn-outline" to="/blog">Ver todos os artigos</Link>
        </p>
      </div>
    </section>
  )
}
