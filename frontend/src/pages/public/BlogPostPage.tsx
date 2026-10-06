import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import api from '../../services/api'
import LeadForm from '../../components/public/LeadForm'
import PublicLayout from '../../components/public/PublicLayout'
import SafeMarkdown from '../../components/public/SafeMarkdown'
import Seo from '../../components/public/Seo'
import { absoluteSiteUrl, responsiveBlogImageSet } from '../../utils/blogImages'

// CTA da faixa final muda conforme a categoria do artigo: sintoma pede
// atendimento, prevenção pede cadastro, institucional pede "como funciona".
const CTA_PADRAO = { eyebrow: 'Precisa de orientação?', titulo: 'Fale com a equipe Saúde PET', texto: 'Este conteúdo é informativo e não substitui avaliação veterinária.' }
const CTA_POR_CATEGORIA: Record<string, { eyebrow: string; titulo: string; texto: string }> = {
  'sinais-de-alerta': { eyebrow: 'Precisa de orientação?', titulo: 'Solicite um atendimento veterinário', texto: 'Descreva o que está acontecendo e um médico-veterinário parceiro avalia seu pet em casa. Este conteúdo não substitui avaliação veterinária.' },
  'prevencao-e-vacinas': { eyebrow: 'Prevenção em dia', titulo: 'Cadastre seu pet e organize as próximas vacinas', texto: 'Carteira de vacinação digital, lembretes de reforço e histórico completo em um só lugar.' },
  'consultas-exames-e-medicamentos': { eyebrow: 'Atendimento em casa', titulo: 'Veja como funciona o atendimento domiciliar', texto: 'Consulta, retorno ou vacinação: solicite pelo Saúde PET e acompanhe tudo pelo perfil do seu pet.' },
  'alimentacao': { eyebrow: 'Cuidado contínuo', titulo: 'Crie o perfil de saúde do seu pet', texto: 'Registre peso, alimentação e orientações do veterinário para acompanhar a evolução do seu pet.' },
  'higiene-e-pele': { eyebrow: 'Precisa de orientação?', titulo: 'Solicite uma avaliação veterinária', texto: 'Coceira e problemas de pele persistentes merecem avaliação profissional. Este conteúdo não substitui a consulta.' },
  'comportamento-e-bem-estar': { eyebrow: 'Cuidado contínuo', titulo: 'Crie o perfil de saúde do seu pet', texto: 'Mudanças de comportamento podem indicar dor ou doença. Registre e acompanhe com um veterinário.' },
  'filhotes-e-idosos': { eyebrow: 'Cada fase importa', titulo: 'Cadastre seu pet e monte o plano de cuidados', texto: 'Do calendário de vacinas do filhote ao check-up semestral do idoso, tudo organizado no Saúde PET.' }
}

export default function BlogPostPage() {
  const { slug } = useParams()
  const [data, setData] = useState<ApiPayload | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => { api.get(`/public/blog/${slug}`).then((response) => setData(response.data)).catch(() => setError(true)) }, [slug])
  if (error) return <PublicLayout><Seo title="Artigo não encontrado | Saúde PET" description="O artigo solicitado não está disponível." path={`/blog/${slug}`} noindex /><div className="public-section empty-state"><h1>Artigo não encontrado</h1><Link to="/blog">Voltar ao blog</Link></div></PublicLayout>
  if (!data) return <PublicLayout><div className="article-loading public-wrap" role="status"><div className="article-loading-copy"><span className="loading-line loading-line-short" /><span className="loading-line" /><span className="loading-line" /></div><div className="article-loading-cover" /><span className="sr-only">Carregando artigo…</span></div></PublicLayout>
  const { post, related } = data
  const cta = CTA_POR_CATEGORIA[post.category?.slug] || CTA_PADRAO
  const published = post.published_at || post.scheduled_for
  const shareUrl = window.location.href
  const socialImage = absoluteSiteUrl(post.social_image || post.cover_image || '/og-default.png')
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Article', headline: post.title, description: post.seo_description || post.excerpt, image: socialImage, author: { '@type': 'Organization', name: post.author_name }, publisher: { '@type': 'Organization', name: 'Saúde PET', logo: { '@type': 'ImageObject', url: absoluteSiteUrl('/brand/logo-completa.png') } }, datePublished: published, dateModified: post.updated_at, mainEntityOfPage: absoluteSiteUrl(`/blog/${post.slug}`) }
  return (
    <PublicLayout>
      <Seo title={`${post.seo_title || post.title} | Saúde PET`} description={post.seo_description || post.excerpt} path={`/blog/${post.slug}`} image={post.social_image || post.cover_image || '/og-default.png'} imageWidth="1200" imageHeight="630" imageType="image/jpeg" type="article" jsonLd={jsonLd} />
      <article className="article-page"><header className="article-header public-wrap narrow"><nav className="breadcrumbs" aria-label="Navegação estrutural"><Link to="/">Início</Link><span>/</span><Link to="/blog">Blog</Link><span>/</span><span aria-current="page">{post.title}</span></nav><span className="post-category">{post.category?.name || 'Saúde PET'}</span><h1>{post.title}</h1><p>{post.excerpt}</p><small>Por {post.author_name} · {published ? new Date(published).toLocaleDateString('pt-BR') : ''}</small></header>{post.cover_image && <figure className="article-cover public-wrap narrow"><img src={post.cover_image} srcSet={responsiveBlogImageSet(post.cover_image)} sizes="(max-width: 620px) calc(100vw - 28px), 840px" alt={post.cover_image_alt || ''} width="1280" height="853" loading="eager" fetchPriority="high" decoding="async" /></figure>}<div className="public-wrap article-body"><SafeMarkdown content={post.content} /><aside className="share-box"><span>Compartilhar</span><a href={`https://wa.me/?text=${encodeURIComponent(`${post.title} ${shareUrl}`)}`} target="_blank" rel="noreferrer">WhatsApp</a><a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(shareUrl)}`} target="_blank" rel="noreferrer">LinkedIn</a></aside></div></article>
      {(related || []).length > 0 && <section className="public-section soft"><div className="public-wrap narrow"><h2>Leituras relacionadas</h2><div className="related-list">{(related || []).map((item: ApiPayload) => <Link key={item.slug} to={`/blog/${item.slug}`}><strong>{item.title}</strong><span>{item.excerpt}</span></Link>)}</div></div></section>}
      <section className="contact-band"><div className="public-wrap split"><div><span className="eyebrow">{cta.eyebrow}</span><h2>{cta.titulo}</h2><p>{cta.texto}</p></div><LeadForm compact /></div></section>
    </PublicLayout>
  )
}
