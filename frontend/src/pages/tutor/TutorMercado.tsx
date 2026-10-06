import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, ConsoleHeader, EmptyState, Eyebrow, Icon, Panel } from '../../components/ui/AppKit'
import { emReais, mercado, type Categoria, type Loja, type Produto } from '../../services/mercado'

/**
 * A vitrine do Saúde Pet Mercado.
 *
 * O que a tela mostra é o que dá para comprar — nada de item bonito que morre
 * no carrinho. A regra de disponibilidade mora no servidor e é mais larga que
 * "estoque > 0": a maioria dos petshops de bairro não faz contagem nenhuma,
 * vende enquanto tem e confere na separação. Exigir número faria a prateleira
 * cheia aparecer como esgotada.
 *
 * O filtro por espécie é o primeiro que aparece porque é o primeiro que a
 * pessoa faz na cabeça: quem veio comprar ração de gato não quer ver ração de
 * cachorro. "Ambos" e produto sem espécie entram nos dois — senão metade do
 * catálogo sumiria de quem tem gato.
 */

const ESPECIES = [
  { valor: '', rotulo: 'Tudo' },
  { valor: 'cao', rotulo: 'Cães' },
  { valor: 'gato', rotulo: 'Gatos' },
  { valor: 'passaro', rotulo: 'Pássaros' }
]

const chip = (ativo: boolean) =>
  `shrink-0 rounded-full px-3.5 py-1.5 text-[0.74rem] font-semibold transition ${
    ativo ? 'bg-primary text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200/80 hover:text-slate-700'
  }`

export default function TutorMercado() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lojas, setLojas] = useState<Loja[]>([])
  const [produtos, setProdutos] = useState<Produto[]>([])
  const [total, setTotal] = useState(0)
  const [itensNoCarrinho, setItensNoCarrinho] = useState(0)

  const [busca, setBusca] = useState(params.get('busca') || '')
  const [buscaAplicada, setBuscaAplicada] = useState(params.get('busca') || '')
  const categoria = params.get('categoria') || ''
  const especie = params.get('especie') || ''
  const lojaFiltro = params.get('loja') || ''

  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [adicionando, setAdicionando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const trocarFiltro = (chave: string, valor: string) => {
    const novos = new URLSearchParams(params)
    if (valor) novos.set(chave, valor)
    else novos.delete(chave)
    setParams(novos, { replace: true })
  }

  useEffect(() => {
    mercado.categorias().then(({ categorias: lista }) => setCategorias(lista)).catch(() => setCategorias([]))
    mercado.lojas().then(({ lojas: lista }) => setLojas(lista)).catch(() => setLojas([]))
  }, [])

  const atualizarSelo = useCallback(() => {
    mercado
      .resumo()
      .then((dados) => setItensNoCarrinho(Number(dados.itens_no_carrinho || 0)))
      .catch(() => {})
  }, [])

  useEffect(() => { atualizarSelo() }, [atualizarSelo])

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const dados = await mercado.produtos({
        busca: buscaAplicada || undefined,
        categoria: categoria || undefined,
        especie: especie || undefined,
        loja: lojaFiltro || undefined,
        limite: 40
      })
      setProdutos(dados.produtos)
      setTotal(dados.total)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível carregar o mercado agora.')
      setProdutos([])
    } finally {
      setCarregando(false)
    }
  }, [buscaAplicada, categoria, especie, lojaFiltro])

  useEffect(() => { carregar() }, [carregar])

  const adicionar = async (produto: Produto) => {
    setAdicionando(produto.id)
    setAviso('')
    try {
      const { carrinho } = await mercado.adicionar(produto.id, 1)
      setAviso(`${produto.nome} entrou no carrinho da ${carrinho.loja.nome_fantasia}.`)
      atualizarSelo()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setAviso(resposta?.data?.error || 'Não foi possível adicionar este item.')
    } finally {
      setAdicionando(null)
    }
  }

  const lojaSelecionada = lojas.find((loja) => loja.id === lojaFiltro)

  const cartaoDoProduto = (produto: Produto) => {
    const emPromocao = produto.preco_vigente < Number(produto.preco)

    return (
      <Panel key={produto.id} className="flex gap-3 overflow-hidden px-3.5 py-3.5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 bg-slate-50 text-slate-300">
          {produto.imagem_url
            ? <img src={produto.imagem_url} alt={produto.imagem_alt || ''} className="h-full w-full object-cover" />
            : <Icon name="inbox" size={22} />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              {produto.marca && (
                <Eyebrow className="text-slate-400">{produto.marca}</Eyebrow>
              )}
              <h3 className="truncate text-[0.85rem] font-semibold leading-tight text-ink">{produto.nome}</h3>
              {produto.variacao && (
                <p className="mt-0.5 truncate text-[0.72rem] text-slate-500">{produto.variacao}</p>
              )}
            </div>
            {produto.exige_receita && <Badge tone="amber">Receita</Badge>}
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[1rem] font-semibold tabular-nums text-ink">
              {emReais(produto.preco_vigente)}
            </span>
            {emPromocao && (
              <span className="text-[0.72rem] text-slate-400 line-through tabular-nums">
                {emReais(produto.preco)}
              </span>
            )}
            {produto.granel && <Badge tone="slate">a granel</Badge>}
          </div>

          <p className="mt-1 truncate text-[0.7rem] text-slate-400">
            {produto.loja?.nome_fantasia}
            {produto.sob_encomenda && produto.prazo_reposicao_dias
              ? ` · encomenda em ${produto.prazo_reposicao_dias} dia(s)`
              : ''}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => adicionar(produto)}
              disabled={adicionando === produto.id}
              className="flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-[0.74rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
            >
              <Icon name="plus" size={14} />
              {adicionando === produto.id ? 'Adicionando…' : 'Adicionar'}
            </button>
            <button
              type="button"
              onClick={() => navigate(`/tutor/mercado/produto/${produto.id}`)}
              className="rounded-xl px-2 py-2 text-[0.74rem] font-semibold text-slate-500 transition hover:text-ink"
            >
              Detalhes
            </button>
          </div>
        </div>
      </Panel>
    )
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      <ConsoleHeader
        label="Saúde Pet Mercado"
        title="Mercado"
        subtitle="Ração, remédio e cuidado das lojas da sua cidade"
        action={
          <button
            type="button"
            onClick={() => navigate('/tutor/mercado/carrinho')}
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10"
            aria-label="Abrir carrinho"
          >
            <Icon name="inbox" size={18} />
            {itensNoCarrinho > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.62rem] font-bold tabular-nums text-white">
                {itensNoCarrinho}
              </span>
            )}
          </button>
        }
      >
        <form
          onSubmit={(evento) => {
            evento.preventDefault()
            setBuscaAplicada(busca.trim())
            trocarFiltro('busca', busca.trim())
          }}
          className="relative mt-4"
        >
          <Icon name="spark" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="search"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
            placeholder="Ração, antipulgas, areia…"
            className="w-full rounded-xl border border-white/15 bg-white/10 py-2.5 pl-9 pr-3 text-[0.82rem] text-white outline-none transition placeholder:text-white/40 focus:border-white/30"
          />
        </form>
      </ConsoleHeader>

      <div className="space-y-4 px-5 pb-6 pt-5">
        {aviso && (
          <div
            role="status"
            className="flex items-start justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-[0.76rem] text-ink"
          >
            <span>{aviso}</span>
            <button type="button" onClick={() => navigate('/tutor/mercado/carrinho')} className="shrink-0 font-semibold text-primary">
              ver carrinho
            </button>
          </div>
        )}

        {/* Espécie primeiro: é o primeiro corte que a pessoa faz na cabeça. */}
        <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
          {ESPECIES.map((item) => (
            <button
              key={item.valor}
              type="button"
              onClick={() => trocarFiltro('especie', item.valor)}
              className={chip(especie === item.valor)}
            >
              {item.rotulo}
            </button>
          ))}
        </div>

        {categorias.length > 0 && (
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
            <button type="button" onClick={() => trocarFiltro('categoria', '')} className={chip(!categoria)}>
              Todas
            </button>
            {categorias.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => trocarFiltro('categoria', item.slug)}
                className={chip(categoria === item.slug)}
              >
                {item.nome}
              </button>
            ))}
          </div>
        )}

        {lojas.length > 0 && (
          <Panel className="px-4 py-3.5">
            <div className="flex items-center justify-between gap-2">
              <Eyebrow className="text-slate-400">
                {lojas.length === 1 ? 'Loja parceira' : `${lojas.length} lojas na sua cidade`}
              </Eyebrow>
              {lojaFiltro && (
                <button type="button" onClick={() => trocarFiltro('loja', '')} className="text-[0.72rem] font-semibold text-primary">
                  ver todas
                </button>
              )}
            </div>
            <div className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1">
              {lojas.map((loja) => (
                <button
                  key={loja.id}
                  type="button"
                  onClick={() => trocarFiltro('loja', lojaFiltro === loja.id ? '' : loja.id)}
                  className={chip(lojaFiltro === loja.id)}
                >
                  {loja.nome_fantasia}
                  {typeof loja.total_produtos === 'number' && (
                    <span className="ml-1.5 font-medium opacity-60">{loja.total_produtos}</span>
                  )}
                </button>
              ))}
            </div>
            {lojaSelecionada && (
              <p className="mt-2 border-t border-slate-100 pt-2 text-[0.72rem] leading-relaxed text-slate-500">
                {lojaSelecionada.endereco}
                {lojaSelecionada.bairro ? `, ${lojaSelecionada.bairro}` : ''} · pronto em cerca de{' '}
                {lojaSelecionada.prazo_preparo_min} min
              </p>
            )}
          </Panel>
        )}

        {erro && (
          <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>
        )}

        {carregando && (
          <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando o mercado…</Panel>
        )}

        {!carregando && produtos.length === 0 && !erro && (
          <EmptyState
            icon="inbox"
            title="Nada por aqui ainda"
            description={
              buscaAplicada || categoria || especie
                ? 'Tente outra busca ou tire um filtro.'
                : 'As lojas da sua cidade ainda estão montando o catálogo. Volte em breve.'
            }
          />
        )}

        {!carregando && produtos.length > 0 && (
          <>
            <p className="text-[0.72rem] text-slate-400">
              {total} {total === 1 ? 'item' : 'itens'} disponíveis
            </p>
            <div className="space-y-2.5">{produtos.map(cartaoDoProduto)}</div>
            {total > produtos.length && (
              <p className="pt-1 text-center text-[0.72rem] text-slate-400">
                Mostrando {produtos.length} de {total}. Refine a busca para achar mais rápido.
              </p>
            )}
          </>
        )}

        <p className="px-1 pt-2 text-[0.68rem] leading-relaxed text-slate-400">
          Quantidades são confirmadas pela loja na separação. Itens com{' '}
          <span className="font-semibold text-amber-700">Receita</span> só são entregues mediante prescrição
          veterinária — a loja confere antes de separar.
        </p>
      </div>

      <TutorBottomNav />
    </div>
  )
}
