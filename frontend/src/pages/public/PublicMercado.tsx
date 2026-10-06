import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PublicLayout from '../../components/public/PublicLayout'
import Seo from '../../components/public/Seo'
import { mercadoPublico, quilometros, type Loja } from '../../services/mercado'

/**
 * A porta pública do Saúde Pet Mercado.
 *
 * Existe porque "ração perto de mim" no Google, o link do catálogo do WhatsApp
 * e o Google Business Profile precisam de uma página que abra SEM login. Esta
 * lista mostra o que qualquer pessoa veria na rua: nome, cidade, se entrega e
 * quantos produtos tem. Comprar continua exigindo conta — o botão leva ao login
 * e devolve a pessoa ao produto.
 */

export default function PublicMercado() {
  const [lojas, setLojas] = useState<Loja[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    mercadoPublico
      .lojas()
      .then(({ lojas: lista }) => setLojas(lista))
      .catch(() => setErro(true))
      .finally(() => setCarregando(false))
  }, [])

  return (
    <PublicLayout>
      <Seo
        title="Mercado Saúde PET — ração, remédios e acessórios de lojas perto de você"
        description="Lojas pet da sua cidade com retirada no balcão e entrega, pagando por Pix ou cartão no Saúde PET."
        path="/mercado"
      />

      <section className="page-hero">
        <div className="public-wrap">
          <span className="eyebrow">Saúde PET Mercado</span>
          <h1>Lojas pet perto de você</h1>
          <p>
            Ração, antipulgas, areia, brinquedos e o que mais a loja do seu bairro tiver — com retirada no
            balcão ou entrega, pagando por Pix ou cartão pelo Saúde PET.
          </p>
        </div>
      </section>

      <section className="public-section">
        <div className="public-wrap">
          {erro && (
            <p className="lv-warning-box" role="alert">
              Não foi possível carregar as lojas agora. Recarregue a página para tentar de novo.
            </p>
          )}

          {carregando && (
            <div className="blog-loading" role="status">
              <span className="loading-line" />
              <span className="loading-line" />
              <span className="sr-only">Carregando lojas…</span>
            </div>
          )}

          {!carregando && !erro && lojas.length === 0 && (
            <div className="empty-state">
              <h2>Ainda não há lojas publicadas</h2>
              <p>As primeiras lojas do mercado estão em cadastro. Volte em breve.</p>
            </div>
          )}

          {lojas.length > 0 && (
            <div className="lv-grid-3">
              {lojas.map((loja) => (
                <article key={loja.id} className="lv-card">
                  {loja.logo_url && (
                    <img
                      src={loja.logo_url}
                      alt=""
                      width="96"
                      height="96"
                      loading="lazy"
                      style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover' }}
                    />
                  )}
                  <h2 style={{ fontSize: '1.15rem', margin: '12px 0 4px' }}>
                    <Link to={`/mercado/${loja.slug}`}>{loja.nome_fantasia}</Link>
                  </h2>
                  <p style={{ margin: 0, color: '#527078' }}>
                    {loja.bairro ? `${loja.bairro}, ` : ''}
                    {loja.cidade}/{loja.estado}
                  </p>
                  {loja.descricao && <p style={{ marginTop: 8 }}>{loja.descricao}</p>}
                  <p style={{ marginTop: 10, fontSize: '0.86rem', color: '#527078' }}>
                    {loja.total_produtos ?? 0} produto(s)
                    {loja.aceita_retirada ? ' · retirada no balcão' : ''}
                    {loja.aceita_entrega && loja.entrega_raio_km
                      ? ` · entrega até ${quilometros(loja.entrega_raio_km)}`
                      : ''}
                  </p>
                  <Link className="lv-btn lv-btn-outline" to={`/mercado/${loja.slug}`} style={{ marginTop: 12 }}>
                    Ver produtos
                  </Link>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </PublicLayout>
  )
}
