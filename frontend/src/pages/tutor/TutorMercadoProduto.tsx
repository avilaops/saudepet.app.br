import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, DataRow, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { emReais, escreverUnidade, mercado, quilometros, type Produto } from '../../services/mercado'
import AssinarProduto from '../../components/tutor/AssinarProduto'

/**
 * Um produto do mercado.
 *
 * Existe porque ração não é uma coisa só: quem compra olha o peso, a linha, o
 * público (filhote, adulto, castrado) e se precisa de receita. Enfiar tudo isso
 * no cartão da vitrine deixaria a lista ilegível; escondê-lo faria a pessoa
 * comprar o saco errado.
 */

export default function TutorMercadoProduto() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [produto, setProduto] = useState<Produto | null>(null)
  const [quantidade, setQuantidade] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [adicionando, setAdicionando] = useState(false)
  const [adicionado, setAdicionado] = useState(false)
  const [assinando, setAssinando] = useState(false)

  useEffect(() => {
    if (!id) return
    mercado
      .produto(id)
      .then(({ produto: encontrado }) => setProduto(encontrado))
      .catch((requestError) => {
        const resposta = (requestError as { response?: { data?: { error?: string } } }).response
        setErro(resposta?.data?.error || 'Produto não encontrado.')
      })
      .finally(() => setCarregando(false))
  }, [id])

  const adicionar = async () => {
    if (!produto) return
    setAdicionando(true)
    setErro('')
    try {
      await mercado.adicionar(produto.id, quantidade)
      setAdicionado(true)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível adicionar este item.')
    } finally {
      setAdicionando(false)
    }
  }

  if (carregando) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <PageHeader title="Produto" onBack={() => navigate(-1)} />
        <Panel className="mx-5 mt-5 px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
      </div>
    )
  }

  if (!produto) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <PageHeader title="Produto" onBack={() => navigate(-1)} />
        <Panel className="mx-5 mt-5 border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700">
          {erro || 'Produto não encontrado.'}
        </Panel>
      </div>
    )
  }

  const emPromocao = produto.preco_vigente < Number(produto.preco)
  const especie = { cao: 'Cães', gato: 'Gatos', passaro: 'Pássaros', ambos: 'Cães e gatos' }[
    produto.especie_alvo || ''
  ]

  return (
    <div className="container-app min-h-screen bg-surface-page pb-28">
      <PageHeader title={produto.loja?.nome_fantasia || 'Produto'} onBack={() => navigate(-1)} />

      <div className="space-y-4 px-5 pb-6 pt-5">
        <Panel className="overflow-hidden">
          <div className="flex h-48 items-center justify-center bg-slate-50 text-slate-300">
            {produto.imagem_url
              ? <img src={produto.imagem_url} alt={produto.imagem_alt || ''} className="h-full w-full object-contain" />
              : <Icon name="inbox" size={44} />}
          </div>

          <div className="space-y-2 px-4 py-4">
            {produto.marca && <Eyebrow className="text-slate-400">{produto.marca}</Eyebrow>}
            <h1 className="text-[1.05rem] font-semibold leading-tight tracking-tight text-ink">{produto.nome}</h1>
            {produto.variacao && <p className="text-[0.8rem] text-slate-500">{produto.variacao}</p>}

            <div className="flex flex-wrap items-baseline gap-2 pt-1">
              <span className="text-[1.4rem] font-semibold tabular-nums text-ink">
                {emReais(produto.preco_vigente)}
              </span>
              {emPromocao && (
                <span className="text-[0.82rem] text-slate-400 line-through tabular-nums">
                  {emReais(produto.preco)}
                </span>
              )}
              {produto.granel && <Badge tone="slate">vendido a granel, por quilo</Badge>}
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {produto.exige_receita && <Badge tone="amber">Exige receita veterinária</Badge>}
              {produto.sob_encomenda && produto.prazo_reposicao_dias && (
                <Badge tone="amber">Encomenda · {produto.prazo_reposicao_dias} dia(s)</Badge>
              )}
              {especie && <Badge tone="teal">{especie}</Badge>}
              {produto.categoria && <Badge tone="slate">{produto.categoria.nome}</Badge>}
            </div>
          </div>
        </Panel>

        {produto.descricao && (
          <Panel className="px-4 py-3.5">
            <Eyebrow className="text-slate-400">Sobre</Eyebrow>
            <p className="mt-1.5 whitespace-pre-line text-[0.78rem] leading-relaxed text-slate-600">
              {produto.descricao}
            </p>
          </Panel>
        )}

        <Panel className="px-4 py-1">
          {produto.tamanho && <DataRow label="Tamanho / peso" value={produto.tamanho} tone="slate" />}
          <DataRow label="Vendido por" value={escreverUnidade(1, produto.unidade).replace('1 ', '')} tone="slate" />
          {produto.peso_gramas && (
            <DataRow
              label="Peso bruto"
              value={produto.peso_gramas >= 1000 ? `${(produto.peso_gramas / 1000).toFixed(1)} kg` : `${produto.peso_gramas} g`}
              tone="slate"
            />
          )}
          {produto.loja && <DataRow label="Loja" value={produto.loja.nome_fantasia} tone="slate" />}
          {produto.loja?.aceita_entrega && produto.loja.entrega_raio_km ? (
            <DataRow
              label="Entrega em casa"
              value={`até ${quilometros(produto.loja.entrega_raio_km)}${
                produto.loja.frete_gratis_acima && Number(produto.loja.frete_gratis_acima) > 0
                  ? ` · grátis a partir de ${emReais(produto.loja.frete_gratis_acima)}`
                  : ''
              }`}
              tone="teal"
            />
          ) : null}
          {produto.loja?.prazo_preparo_min && (
            <DataRow label="Pronto em" value={`~${produto.loja.prazo_preparo_min} min`} tone="slate" />
          )}
        </Panel>

        {/* Assinatura: só aparece onde a loja vende assim, e nunca para item com
            receita — a receita precisa ser conferida a cada compra. */}
        {produto.loja?.aceita_assinatura && !produto.exige_receita && (
          <Panel className="border-primary/20 bg-primary/5 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Eyebrow className="text-primary">Entrega programada</Eyebrow>
                <p className="mt-1 text-[0.76rem] leading-relaxed text-slate-600">
                  Receba no ritmo do seu pet
                  {Number(produto.loja.assinatura_desconto_pct) > 0
                    ? ` com ${Number(produto.loja.assinatura_desconto_pct)}% de desconto em cada pedido`
                    : ''}
                  {produto.loja.assinatura_frete_gratis && produto.loja.aceita_entrega ? ' e frete grátis na entrega da loja' : ''}
                  . Pause ou cancele quando quiser.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssinando(true)}
                className="shrink-0 rounded-xl bg-primary px-3.5 py-2 text-[0.76rem] font-semibold text-white transition hover:bg-[#127e82]"
              >
                Assinar
              </button>
            </div>
          </Panel>
        )}

        {produto.exige_receita && (
          <Panel className="border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-[0.74rem] leading-relaxed text-amber-800">
              Este item é de uso veterinário sob prescrição. A loja confere a receita antes de separar — leve a
              via do seu veterinário na retirada.
            </p>
          </Panel>
        )}

        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}
      </div>

      {assinando && <AssinarProduto produto={produto} aoFechar={() => setAssinando(false)} />}

      {/* Barra de compra fixa: o preço e o botão nunca saem da vista. */}
      <div className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200/80 bg-white/95 px-5 py-3 backdrop-blur">
        {adicionado ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setAdicionado(false); setQuantidade(1) }}
              className="flex-1 rounded-xl bg-slate-50 px-4 py-3 text-[0.8rem] font-semibold text-slate-600 ring-1 ring-slate-200/80"
            >
              Adicionar mais
            </button>
            <button
              type="button"
              onClick={() => navigate('/tutor/mercado/carrinho')}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
            >
              Ver carrinho
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={() => setQuantidade((atual) => Math.max(1, atual - 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 text-ink transition hover:bg-slate-50"
                aria-label="Diminuir"
              >
                <Icon name="close" size={14} className="rotate-45" />
              </button>
              <span className="min-w-8 text-center text-[0.9rem] font-semibold tabular-nums text-ink">
                {quantidade}
              </span>
              <button
                type="button"
                onClick={() => setQuantidade((atual) => Math.min(99, atual + 1))}
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200/80 text-ink transition hover:bg-slate-50"
                aria-label="Aumentar"
              >
                <Icon name="plus" size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={adicionar}
              disabled={adicionando}
              className="flex-1 rounded-xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
            >
              {adicionando
                ? 'Adicionando…'
                : `Adicionar · ${emReais(produto.preco_vigente * quantidade)}`}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
