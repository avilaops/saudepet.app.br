import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'
import {
  emReais,
  escreverUnidade,
  mercadoPublico,
  quilometros,
  type Categoria,
  type Loja,
  type Produto
} from '../../services/mercado'
import { chaveDoDado, useDadosIniciais } from '../../ssr/dadosIniciais'
import { baseDoSite } from '../../ssr/site'

/**
 * A vitrine pública de UMA loja.
 *
 * É a página que o Google Business Profile aponta e que o feed do WhatsApp usa
 * como "link da loja". Mostra o que a loja mostraria na rua — endereço,
 * telefone, produtos e preço de etiqueta — e nada da economia dela.
 */

const ESPECIES = [
  ['', 'Tudo'],
  ['cao', 'Cães'],
  ['gato', 'Gatos'],
  ['passaro', 'Pássaros']
]

export default function PublicMercadoLoja() {
  const { slug = '' } = useParams()
  const [params, setParams] = useSearchParams()

  const categoria = params.get('categoria') || ''
  const especie = params.get('especie') || ''
  const buscaAplicada = params.get('busca') || ''
  const pagina = Number(params.get('pagina') || 1)

  // A loja e a página de produtos pedida chegam do servidor com o HTML.
  type ProdutosDaLoja = { produtos: Produto[]; total: number; paginas: number }
  const dadoInicial = useDadosIniciais()
  const lojaPronta = dadoInicial<{ loja: Loja; categorias: Categoria[] }>(`/public/mercado/lojas/${slug}`)
  const produtosProntos = dadoInicial<ProdutosDaLoja>(
    chaveDoDado(`/public/mercado/lojas/${slug}/produtos`, { busca: buscaAplicada, categoria, especie, pagina, limite: 24 })
  )

  const [loja, setLoja] = useState<Loja | null>(lojaPronta.dado?.loja ?? null)
  const [categorias, setCategorias] = useState<Categoria[]>(lojaPronta.dado?.categorias || [])
  const [produtos, setProdutos] = useState<Produto[]>(produtosProntos.dado?.produtos || [])
  const [total, setTotal] = useState(produtosProntos.dado?.total ?? 0)
  const [paginas, setPaginas] = useState(produtosProntos.dado?.paginas ?? 1)
  const [carregando, setCarregando] = useState(!produtosProntos.veioPronto)
  const [naoEncontrada, setNaoEncontrada] = useState(lojaPronta.naoEncontrado)
  const [busca, setBusca] = useState(params.get('busca') || '')

  // Endereço próprio por página (`?pagina=2`), para o Google alcançar todos os
  // produtos da loja e não só os 24 primeiros.
  const enderecoDaPagina = (numero: number) => {
    const novos = new URLSearchParams(params)
    if (numero > 1) novos.set('pagina', String(numero))
    else novos.delete('pagina')
    const texto = novos.toString()
    return texto ? `/mercado/${slug}?${texto}` : `/mercado/${slug}`
  }

  const trocar = (chave: string, valor: string) => {
    const novos = new URLSearchParams(params)
    if (valor) novos.set(chave, valor)
    else novos.delete(chave)
    if (chave !== 'pagina') novos.delete('pagina')
    setParams(novos, { replace: true })
  }

  useEffect(() => {
    if (!slug || lojaPronta.veioPronto) return
    mercadoPublico
      .loja(slug)
      .then((dados) => {
        setLoja(dados.loja)
        setCategorias(dados.categorias)
      })
      .catch(() => setNaoEncontrada(true))
  }, [slug])

  useEffect(() => {
    if (!slug) return
    if (produtosProntos.dado) {
      setProdutos(produtosProntos.dado.produtos)
      setTotal(produtosProntos.dado.total)
      setPaginas(produtosProntos.dado.paginas)
      setCarregando(false)
      return
    }
    setCarregando(true)
    mercadoPublico
      .produtos(slug, {
        busca: buscaAplicada || undefined,
        categoria: categoria || undefined,
        especie: especie || undefined,
        pagina,
        limite: 24
      })
      .then((dados) => {
        setProdutos(dados.produtos)
        setTotal(dados.total)
        setPaginas(dados.paginas)
      })
      .catch(() => setProdutos([]))
      .finally(() => setCarregando(false))
  }, [slug, buscaAplicada, categoria, especie, pagina])

  if (naoEncontrada) {
    return (
      <PublicLayout>
        <Seo title="Loja não encontrada | Saúde PET Mercado" description="Esta loja não está no ar." path={`/mercado/${slug}`} noindex />
        <section className="public-section">
          <div className="public-wrap empty-state">
            <h1>Loja não encontrada</h1>
            <p>Esta loja não está no ar. <Link to="/mercado">Ver as lojas do mercado</Link>.</p>
          </div>
        </section>
      </PublicLayout>
    )
  }

  const endereco = loja
    ? `${[loja.endereco, loja.complemento, loja.bairro].filter(Boolean).join(', ')} — ${loja.cidade}/${loja.estado}`
    : ''

  return (
    <PublicLayout>
      {loja && (
        <Seo
          title={`${loja.nome_fantasia} — loja pet em ${loja.cidade} | Saúde PET Mercado`}
          description={
            loja.descricao ||
            `${loja.nome_fantasia} em ${loja.cidade}/${loja.estado}: ${total} produto(s) para o seu pet, com retirada no balcão${loja.aceita_entrega ? ' e entrega' : ''}.`
          }
          path={`/mercado/${loja.slug}`}
          image={loja.logo_url || undefined}
          jsonLd={{
            '@context': 'https://schema.org',
            '@type': 'PetStore',
            name: loja.nome_fantasia,
            description: loja.descricao || undefined,
            url: `${baseDoSite()}/mercado/${loja.slug}`,
            telephone: loja.telefone,
            image: loja.logo_url || undefined,
            address: {
              '@type': 'PostalAddress',
              streetAddress: [loja.endereco, loja.complemento].filter(Boolean).join(', '),
              addressLocality: loja.cidade,
              addressRegion: loja.estado,
              addressCountry: 'BR'
            },
            // É o que faz "petshop perto de mim" achar a loja.
            geo:
              loja.latitude != null && loja.longitude != null
                ? { '@type': 'GeoCoordinates', latitude: loja.latitude, longitude: loja.longitude }
                : undefined
          }}
        />
      )}

      <section className="page-hero">
        <div className="public-wrap">
          <span className="eyebrow">
            <Link to="/mercado">Saúde PET Mercado</Link>
          </span>
          <h1>{loja?.nome_fantasia || 'Loja'}</h1>
          {loja && (
            <>
              {loja.descricao && <p>{loja.descricao}</p>}
              <p style={{ color: '#527078' }}>
                {endereco} · <a href={`tel:${loja.telefone.replace(/\D/g, '')}`}>{loja.telefone}</a>
                {loja.whatsapp && (
                  <>
                    {' · '}
                    <a href={`https://wa.me/55${loja.whatsapp.replace(/\D/g, '')}`} target="_blank" rel="noreferrer">
                      WhatsApp
                    </a>
                  </>
                )}
              </p>
              <p style={{ color: '#527078', fontSize: '0.9rem' }}>
                {loja.aceita_retirada ? 'Retirada no balcão' : ''}
                {loja.aceita_entrega && loja.entrega_raio_km
                  ? `${loja.aceita_retirada ? ' · ' : ''}Entrega até ${quilometros(loja.entrega_raio_km)}${
                      loja.frete_gratis_acima && Number(loja.frete_gratis_acima) > 0
                        ? ` (grátis a partir de ${emReais(loja.frete_gratis_acima)})`
                        : ''
                    }`
                  : ''}
                {loja.aceita_combinar ? ' · Entrega combinada' : ''}
              </p>
            </>
          )}

          <div className="blog-filters">
            <label>
              <span>Buscar produto</span>
              <input
                type="search"
                value={busca}
                onChange={(evento) => setBusca(evento.target.value)}
                onKeyDown={(evento) => {
                  if (evento.key === 'Enter') trocar('busca', busca.trim())
                }}
                onBlur={() => trocar('busca', busca.trim())}
                placeholder="Ração, antipulgas, areia…"
              />
            </label>
            <label>
              <span>Categoria</span>
              <select value={categoria} onChange={(evento) => trocar('categoria', evento.target.value)}>
                <option value="">Todas</option>
                {categorias.map((item) => (
                  <option key={item.id} value={item.slug}>
                    {item.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Para qual animal</span>
              <select value={especie} onChange={(evento) => trocar('especie', evento.target.value)}>
                {ESPECIES.map(([valor, texto]) => (
                  <option key={valor} value={valor}>
                    {texto}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="public-section">
        <div className="public-wrap">
          {carregando ? (
            <div className="blog-loading" role="status">
              <span className="loading-line" />
              <span className="loading-line" />
              <span className="sr-only">Carregando produtos…</span>
            </div>
          ) : produtos.length === 0 ? (
            <div className="empty-state">
              <h2>Nenhum produto aqui</h2>
              <p>Tente outra busca ou outra categoria.</p>
            </div>
          ) : (
            <>
              <p style={{ color: '#527078', marginBottom: 16 }}>{total} produto(s)</p>
              <div className="lv-grid-3">
                {produtos.map((produto) => {
                  const emPromocao = produto.preco_vigente < Number(produto.preco)
                  return (
                    <article key={produto.id} className="lv-card">
                      <Link to={`/mercado/${slug}/${produto.slug}`} aria-label={produto.nome}>
                        {produto.imagem_url ? (
                          <img
                            src={produto.imagem_url}
                            alt={produto.imagem_alt || produto.nome}
                            loading="lazy"
                            width="400"
                            height="400"
                            style={{ width: '100%', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: 16 }}
                          />
                        ) : (
                          <div
                            aria-hidden="true"
                            style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: 16, background: '#eef3f3' }}
                          />
                        )}
                      </Link>
                      {produto.marca && (
                        <span className="eyebrow" style={{ marginTop: 10, display: 'block' }}>
                          {produto.marca}
                        </span>
                      )}
                      <h2 style={{ fontSize: '1.02rem', margin: '4px 0' }}>
                        <Link to={`/mercado/${slug}/${produto.slug}`}>{produto.nome}</Link>
                      </h2>
                      {(produto.variacao || produto.tamanho) && (
                        <p style={{ margin: 0, color: '#527078', fontSize: '0.86rem' }}>
                          {[produto.variacao, produto.tamanho].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <p style={{ margin: '8px 0 0', fontWeight: 600 }}>
                        {emReais(produto.preco_vigente)}
                        {emPromocao && (
                          <s style={{ marginLeft: 8, color: '#8aa0a5', fontWeight: 400 }}>{emReais(produto.preco)}</s>
                        )}
                        <span style={{ color: '#8aa0a5', fontWeight: 400, fontSize: '0.8rem' }}>
                          {' '}
                          / {escreverUnidade(1, produto.unidade).replace('1 ', '')}
                        </span>
                      </p>
                      {produto.exige_receita && (
                        <p style={{ margin: '4px 0 0', color: '#b45309', fontSize: '0.8rem' }}>exige receita veterinária</p>
                      )}
                    </article>
                  )
                })}
              </div>

              {paginas > 1 && (
                <nav className="pagination" aria-label="Paginação">
                  {pagina <= 1 ? (
                    <span className="pagination-link is-disabled" aria-disabled="true">Anterior</span>
                  ) : (
                    <Link className="pagination-link" to={enderecoDaPagina(pagina - 1)} rel="prev">Anterior</Link>
                  )}
                  <span>
                    Página {pagina} de {paginas}
                  </span>
                  {pagina >= paginas ? (
                    <span className="pagination-link is-disabled" aria-disabled="true">Próxima</span>
                  ) : (
                    <Link className="pagination-link" to={enderecoDaPagina(pagina + 1)} rel="next">Próxima</Link>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </section>
    </PublicLayout>
  )
}
