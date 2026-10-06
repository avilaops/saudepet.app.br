import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'
import { emReais, escreverUnidade, mercadoPublico, quilometros, type Loja, type Produto } from '../../services/mercado'

/**
 * Um produto, para quem chegou pelo Google ou pelo WhatsApp.
 *
 * É a página que o feed aponta. Mostra o que a etiqueta mostraria e leva quem
 * quer comprar ao login — que devolve a pessoa direto ao produto na área do
 * tutor, sem ter de procurar de novo.
 */

type ProdutoPublico = Produto & { loja: Loja; disponivel: boolean; imagens?: string[] | null }

export default function PublicMercadoProduto() {
  const { slug = '', produto: produtoSlug = '' } = useParams()

  const [produto, setProduto] = useState<ProdutoPublico | null>(null)
  const [fotoAberta, setFotoAberta] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [naoEncontrado, setNaoEncontrado] = useState(false)

  useEffect(() => {
    if (!slug || !produtoSlug) return
    mercadoPublico
      .produto(slug, produtoSlug)
      .then(({ produto: encontrado }) => {
        setProduto(encontrado as ProdutoPublico)
        setFotoAberta(encontrado.imagem_url || encontrado.imagens?.[0] || null)
      })
      .catch(() => setNaoEncontrado(true))
      .finally(() => setCarregando(false))
  }, [slug, produtoSlug])

  if (naoEncontrado) {
    return (
      <PublicLayout>
        <Seo title="Produto não encontrado | Saúde PET Mercado" description="Este produto não está mais no catálogo." path={`/mercado/${slug}`} noindex />
        <section className="public-section">
          <div className="public-wrap empty-state">
            <h1>Produto não encontrado</h1>
            <p>
              Este produto não está mais no catálogo. <Link to={`/mercado/${slug}`}>Ver a loja</Link>.
            </p>
          </div>
        </section>
      </PublicLayout>
    )
  }

  if (carregando || !produto) {
    return (
      <PublicLayout>
        <section className="public-section">
          <div className="public-wrap blog-loading" role="status">
            <span className="loading-line" />
            <span className="loading-line" />
            <span className="sr-only">Carregando produto…</span>
          </div>
        </section>
      </PublicLayout>
    )
  }

  const { loja } = produto
  const nomeCompleto = [produto.nome, produto.variacao, produto.tamanho].filter(Boolean).join(' · ')
  const emPromocao = produto.preco_vigente < Number(produto.preco)
  const fotos = [produto.imagem_url, ...(produto.imagens || [])].filter(
    (foto, indice, lista): foto is string => Boolean(foto) && lista.indexOf(foto) === indice
  )
  const caminho = `/mercado/${loja.slug}/${produto.slug}`
  const destinoDaCompra = `/login?next=${encodeURIComponent(`/tutor/mercado/produto/${produto.id}`)}`

  return (
    <PublicLayout>
      <Seo
        title={`${nomeCompleto} — ${emReais(produto.preco_vigente)} na ${loja.nome_fantasia} | Saúde PET Mercado`}
        description={
          produto.descricao ||
          `${nomeCompleto} por ${emReais(produto.preco_vigente)} na ${loja.nome_fantasia}, ${loja.cidade}/${loja.estado}.`
        }
        path={caminho}
        image={fotos[0] || undefined}
        type="product"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: nomeCompleto,
          description: produto.descricao || undefined,
          image: fotos.length ? fotos : undefined,
          sku: produto.id,
          brand: produto.marca ? { '@type': 'Brand', name: produto.marca } : undefined,
          offers: {
            '@type': 'Offer',
            url: `${(import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')}${caminho}`,
            priceCurrency: 'BRL',
            price: produto.preco_vigente.toFixed(2),
            availability: produto.disponivel ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            itemCondition: 'https://schema.org/NewCondition',
            seller: { '@type': 'PetStore', name: loja.nome_fantasia }
          }
        }}
      />

      <section className="public-section">
        <div className="public-wrap">
          <p className="eyebrow">
            <Link to="/mercado">Saúde PET Mercado</Link> · <Link to={`/mercado/${loja.slug}`}>{loja.nome_fantasia}</Link>
          </p>

          <div className="lv-grid-2" style={{ alignItems: 'start' }}>
            <div>
              {fotoAberta ? (
                <img
                  src={fotoAberta}
                  alt={produto.imagem_alt || nomeCompleto}
                  title={nomeCompleto}
                  width="800"
                  height="800"
                  style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 24 }}
                />
              ) : (
                <div aria-hidden="true" style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 24, background: '#eef3f3' }} />
              )}
              {fotos.length > 1 && (
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {fotos.map((foto) => (
                    <button
                      key={foto}
                      type="button"
                      onClick={() => setFotoAberta(foto)}
                      aria-label="Ver esta foto"
                      style={{
                        padding: 0,
                        border: foto === fotoAberta ? '2px solid #159fa3' : '2px solid transparent',
                        borderRadius: 12,
                        background: 'none',
                        cursor: 'pointer'
                      }}
                    >
                      <img src={foto} alt="" width="64" height="64" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 10 }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              {produto.marca && <span className="eyebrow">{produto.marca}</span>}
              <h1 style={{ marginTop: 6 }}>{produto.nome}</h1>
              {(produto.variacao || produto.tamanho) && (
                <p style={{ color: '#527078', marginTop: 0 }}>
                  {[produto.variacao, produto.tamanho].filter(Boolean).join(' · ')}
                </p>
              )}

              <p style={{ fontSize: '1.7rem', fontWeight: 600, margin: '14px 0 4px' }}>
                {emReais(produto.preco_vigente)}
                {emPromocao && <s style={{ marginLeft: 10, color: '#8aa0a5', fontWeight: 400, fontSize: '1.1rem' }}>{emReais(produto.preco)}</s>}
                <span style={{ color: '#8aa0a5', fontWeight: 400, fontSize: '0.9rem' }}>
                  {' '}
                  por {escreverUnidade(1, produto.unidade).replace('1 ', '')}
                </span>
              </p>
              <p style={{ margin: 0, color: produto.disponivel ? '#0f766e' : '#b91c1c', fontWeight: 600 }}>
                {produto.disponivel ? 'Disponível' : 'Esgotado no momento'}
                {produto.sob_encomenda && produto.prazo_reposicao_dias
                  ? ` · sob encomenda, até ${produto.prazo_reposicao_dias} dia(s)`
                  : ''}
              </p>
              {produto.exige_receita && (
                <p className="lv-warning-box" style={{ marginTop: 12 }}>
                  Este produto exige receita veterinária. A loja confere a prescrição antes de separar.
                </p>
              )}

              {produto.descricao && <p style={{ marginTop: 16 }}>{produto.descricao}</p>}

              <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link className="lv-btn" to={destinoDaCompra}>
                  Comprar pelo Saúde PET
                </Link>
                {loja.whatsapp && (
                  <a
                    className="lv-btn lv-btn-outline"
                    href={`https://wa.me/55${loja.whatsapp.replace(/\D/g, '')}?text=${encodeURIComponent(`Olá! Vi "${nomeCompleto}" no Saúde PET Mercado.`)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Perguntar no WhatsApp
                  </a>
                )}
              </div>

              <div className="lv-card" style={{ marginTop: 24 }}>
                <strong>{loja.nome_fantasia}</strong>
                <p style={{ margin: '4px 0 0', color: '#527078', fontSize: '0.9rem' }}>
                  {[loja.endereco, loja.complemento, loja.bairro].filter(Boolean).join(', ')} — {loja.cidade}/{loja.estado}
                </p>
                <p style={{ margin: '6px 0 0', color: '#527078', fontSize: '0.86rem' }}>
                  {loja.aceita_retirada ? 'Retirada no balcão' : ''}
                  {loja.aceita_entrega && loja.entrega_raio_km
                    ? `${loja.aceita_retirada ? ' · ' : ''}Entrega até ${quilometros(loja.entrega_raio_km)}`
                    : ''}
                  {loja.aceita_combinar ? ' · Entrega combinada' : ''}
                  {' · '}
                  <a href={`tel:${loja.telefone.replace(/\D/g, '')}`}>{loja.telefone}</a>
                </p>
                <Link to={`/mercado/${loja.slug}`} style={{ display: 'inline-block', marginTop: 8, fontSize: '0.9rem' }}>
                  Ver todos os produtos da loja
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicLayout>
  )
}
