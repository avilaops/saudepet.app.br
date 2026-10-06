import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSocket } from '../../contexts/SocketContext'
import { Badge, ConsoleHeader, EmptyState, Eyebrow, GhostAction, Icon, Metric, NavRow, Panel } from '../../components/ui/AppKit'
import { emReais, ENTREGA, escreverUnidade, ESTADO_DO_PEDIDO, minhaLoja, quilometros, type Assinatura, type Pedido } from '../../services/mercado'

/**
 * O painel de quem vende.
 *
 * A tela é a FILA DE TRABALHO, não um relatório: o que abre primeiro é o que
 * precisa de mão agora — pedido pago esperando separação, pedido pronto
 * esperando o cliente. Faturamento vem depois, porque não é o que faz alguém
 * abrir o app às oito da manhã.
 *
 * Cada pedido tem UM botão, e ele diz o próximo passo pelo nome: "Começar a
 * separar", "Marcar como pronto", "Concluir". A máquina de estados fica no
 * servidor — a tela não escolhe o próximo estado, ela pede o próximo passo.
 */

/**
 * O nome do botão muda com o jeito de entregar: quando a própria loja leva,
 * "pronto" é o momento em que o pedido sai, e "concluído" é a entrega.
 */
function proximoPasso(pedido: Pedido): string | undefined {
  const pelaLoja = pedido.entrega_tipo === 'loja'
  if (pedido.status === 'pago') return 'Começar a separar'
  if (pedido.entrega_tipo === 'transportadora' && pedido.status === 'em_separacao') {
    return pedido.rastreio_codigo ? 'Marcar como despachado' : undefined
  }
  if (pedido.status === 'em_separacao') return pelaLoja ? 'Saiu para entrega' : 'Marcar como pronto'
  if (pedido.status === 'pronto') return pelaLoja ? 'Entregue' : 'Concluir'
  return undefined
}

export default function LojaPainel() {
  const navigate = useNavigate()
  const { socket } = useSocket()

  const [painel, setPainel] = useState<{
    loja: { id: string; nome_fantasia: string; status: string }
    fila: { a_separar: number; prontos: number }
    mes: { pedidos: number; faturado: number; a_receber: number; comissao: number }
    catalogo: { publicados: number; aguardando_cadastro: number }
  } | null>(null)

  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [semLoja, setSemLoja] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('')
  const [assinaturas, setAssinaturas] = useState<Assinatura[] | null>(null)
  const [mostrarAssinaturas, setMostrarAssinaturas] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const [dadosDoPainel, dadosDosPedidos] = await Promise.all([
        minhaLoja.painel(),
        minhaLoja.pedidos('abertos')
      ])
      setPainel(dadosDoPainel)
      setPedidos(dadosDosPedidos.pedidos)
      setSemLoja(false)
      // Assinantes são consulta, não fila: falhar aqui não pode esconder os pedidos.
      minhaLoja.assinaturas().then(({ assinaturas: lista }) => setAssinaturas(lista)).catch(() => setAssinaturas([]))
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { status?: number; data?: { error?: string } } }).response
      // 404 aqui não é erro: é alguém que ainda não abriu loja nenhuma, e a tela
      // certa para essa pessoa é o convite, não uma mensagem de falha.
      if (resposta?.status === 404) setSemLoja(true)
      else setErro(resposta?.data?.error || 'Não foi possível abrir o painel.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  // Pedido pago chega enquanto a loja está com o painel aberto. Sem isto, ele
  // só apareceria no próximo recarregamento manual.
  useEffect(() => {
    if (!socket) return
    const aoChegarPedido = () => carregar()
    socket.on('mercado:pedido_novo', aoChegarPedido)
    return () => { socket.off('mercado:pedido_novo', aoChegarPedido) }
  }, [socket, carregar])

  const avancar = async (pedido: Pedido) => {
    setOcupado(pedido.id)
    setErro('')
    try {
      await minhaLoja.avancar(pedido.id)
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível avançar este pedido.')
    } finally {
      setOcupado(null)
    }
  }

  const cancelar = async (pedidoId: string) => {
    if (motivo.trim().length < 3) {
      setErro('Escreva o motivo — o cliente vai ler.')
      return
    }
    setOcupado(pedidoId)
    setErro('')
    try {
      await minhaLoja.cancelar(pedidoId, motivo.trim())
      setCancelandoId(null)
      setMotivo('')
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível cancelar.')
    } finally {
      setOcupado(null)
    }
  }

  const emitirEtiqueta = async (pedido: Pedido) => {
    if (!window.confirm(`Emitir a etiqueta de ${pedido.frete_transportadora || 'transportadora'} para ${pedido.codigo}? O valor do frete será debitado da carteira CepCerto.`)) return
    setOcupado(pedido.id)
    setErro('')
    try {
      const { pedido: atualizado } = await minhaLoja.emitirEtiqueta(pedido.id)
      await carregar()
      if (atualizado.etiqueta_url) window.open(atualizado.etiqueta_url, '_blank', 'noopener,noreferrer')
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível emitir a etiqueta.')
    } finally {
      setOcupado(null)
    }
  }

  if (carregando) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <ConsoleHeader label="Saúde Pet Mercado" title="Minha loja" />
        <Panel className="mx-5 mt-5 px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
      </div>
    )
  }

  if (semLoja) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <ConsoleHeader label="Saúde Pet Mercado" title="Vender no mercado" />
        <div className="space-y-3.5 px-5 py-5">
          <EmptyState
            icon="inbox"
            title="Você ainda não tem loja"
            description="Cadastre sua empresa, monte o catálogo e receba pedidos dos tutores da sua cidade."
          />
          <button
            type="button"
            onClick={() => navigate('/mercado/loja')}
            className="w-full rounded-xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#127e82]"
          >
            Abrir minha loja
          </button>
        </div>
      </div>
    )
  }

  const naVitrine = painel?.loja.status === 'aprovada'

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <ConsoleHeader
        label="Saúde Pet Mercado"
        title={painel?.loja.nome_fantasia || 'Minha loja'}
        subtitle={naVitrine ? 'No ar na vitrine' : 'Ainda não está na vitrine'}
        action={<GhostAction onClick={() => navigate('/mercado/loja')} icon="edit" label="Cadastro" />}
      >
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/12 bg-white/5 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">A separar</span>
            <p className="mt-0.5 text-[1.4rem] font-semibold leading-none tabular-nums text-white">
              {painel?.fila.a_separar ?? 0}
            </p>
          </div>
          <div className="rounded-xl border border-white/12 bg-white/5 px-3 py-2.5">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/50">Prontos</span>
            <p className="mt-0.5 text-[1.4rem] font-semibold leading-none tabular-nums text-white">
              {painel?.fila.prontos ?? 0}
            </p>
          </div>
        </div>
      </ConsoleHeader>

      <div className="space-y-3.5 px-5 py-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {!naVitrine && (
          <Panel className="border-amber-200 bg-amber-50 px-4 py-3.5">
            <p className="text-[0.76rem] leading-relaxed text-amber-800">
              Sua loja está <strong>{painel?.loja.status}</strong> e não recebe pedidos ainda. Complete o
              cadastro e envie para análise.
            </p>
            <button
              type="button"
              onClick={() => navigate('/mercado/loja')}
              className="mt-2 text-[0.76rem] font-semibold text-amber-900 underline"
            >
              Abrir o cadastro
            </button>
          </Panel>
        )}

        {/* ── A fila ── */}
        <div>
          <Eyebrow className="px-1 text-slate-400">Pedidos em aberto</Eyebrow>
          <div className="mt-2 space-y-2.5">
            {pedidos.length === 0 && (
              <EmptyState
                icon="check"
                title="Nada na fila"
                description="Quando um pedido for pago, ele aparece aqui na hora."
              />
            )}

            {pedidos.map((pedido) => {
              const estado = ESTADO_DO_PEDIDO[pedido.status] || { rotulo: pedido.status, tom: 'slate' as const }
              const passo = proximoPasso(pedido)

              return (
                <Panel key={pedido.id} className="overflow-hidden">
                  <div className="flex items-start justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[0.88rem] font-semibold tabular-nums text-ink">{pedido.codigo}</span>
                        <Badge tone={estado.tom}>{estado.rotulo}</Badge>
                        {pedido.exige_receita && <Badge tone="amber">Receita</Badge>}
                      </div>
                      <p className="mt-0.5 text-[0.72rem] text-slate-400">
                        {pedido.tutor?.nome} · {(ENTREGA[pedido.entrega_tipo] || pedido.entrega_tipo).toLowerCase()}
                        {pedido.entrega_tipo === 'loja' && pedido.entrega_distancia_km != null
                          ? ` · ${quilometros(pedido.entrega_distancia_km)}`
                          : ''}
                        {pedido.entrega_tipo === 'transportadora' && pedido.frete_transportadora
                          ? ` · ${pedido.frete_transportadora} ${pedido.frete_servico?.toUpperCase() || ''}`
                          : ''}
                      </p>
                    </div>
                    <span className="shrink-0 text-[0.95rem] font-semibold tabular-nums text-ink">
                      {emReais(pedido.total)}
                    </span>
                  </div>

                  <ul className="divide-y divide-slate-100 border-t border-slate-100">
                    {pedido.itens.map((item) => (
                      <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2">
                        <span className="min-w-0">
                          <span className="block truncate text-[0.78rem] text-ink">{item.nome}</span>
                          {item.variacao && (
                            <span className="block truncate text-[0.68rem] text-slate-400">{item.variacao}</span>
                          )}
                        </span>
                        <span className="shrink-0 text-[0.78rem] font-semibold tabular-nums text-slate-600">
                          {escreverUnidade(item.quantidade, item.unidade)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  {pedido.exige_receita && (
                    <p className="border-t border-slate-100 bg-amber-50 px-4 py-2 text-[0.7rem] leading-relaxed text-amber-800">
                      Item sob prescrição: confira a receita do cliente antes de separar.
                    </p>
                  )}

                  {pedido.observacao && (
                    <p className="border-t border-slate-100 px-4 py-2 text-[0.72rem] leading-relaxed text-slate-500">
                      Observação: {pedido.observacao}
                    </p>
                  )}

                  {(pedido.entrega_tipo === 'combinar' || pedido.entrega_tipo === 'loja' || pedido.entrega_tipo === 'transportadora') && pedido.entrega_endereco && (
                    <p className="border-t border-slate-100 px-4 py-2 text-[0.72rem] leading-relaxed text-slate-500">
                      Entregar em: {pedido.entrega_endereco}
                      {pedido.entrega_complemento ? `, ${pedido.entrega_complemento}` : ''}
                      {pedido.tutor?.telefone ? ` · ${pedido.tutor.telefone}` : ''}
                      {pedido.entrega_tipo === 'loja'
                        ? ` · frete ${Number(pedido.frete) > 0 ? emReais(pedido.frete) : 'grátis'}`
                        : ''}
                    </p>
                  )}

                  {pedido.rastreio_codigo && (
                    <div className="border-t border-slate-100 bg-primary/5 px-4 py-2.5 text-[0.72rem] text-ink">
                      <strong className="font-semibold">Rastreio {pedido.rastreio_codigo}</strong>
                      <div className="mt-1 flex gap-3">
                        {pedido.etiqueta_url && <a href={pedido.etiqueta_url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Abrir etiqueta</a>}
                        {pedido.declaracao_url && <a href={pedido.declaracao_url} target="_blank" rel="noreferrer" className="font-semibold text-primary underline">Declaração de conteúdo</a>}
                      </div>
                    </div>
                  )}

                  {cancelandoId === pedido.id ? (
                    <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                      <textarea
                        value={motivo}
                        onChange={(evento) => setMotivo(evento.target.value)}
                        rows={2}
                        placeholder="Motivo do cancelamento (o cliente lê)"
                        className="w-full resize-none rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3 py-2 text-[0.78rem] outline-none focus:border-primary"
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => { setCancelandoId(null); setMotivo('') }}
                          className="flex-1 rounded-xl bg-slate-50 px-3 py-2 text-[0.76rem] font-semibold text-slate-500 ring-1 ring-slate-200/80"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          onClick={() => cancelar(pedido.id)}
                          disabled={ocupado === pedido.id}
                          className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-[0.76rem] font-semibold text-white disabled:opacity-60"
                        >
                          Cancelar pedido
                        </button>
                      </div>
                      <p className="text-[0.68rem] leading-relaxed text-slate-400">
                        O estoque volta e, se o pedido já estava pago, o valor é devolvido ao cliente.
                      </p>
                    </div>
                  ) : (
                    <div className="flex gap-2 border-t border-slate-100 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setCancelandoId(pedido.id)}
                        className="rounded-xl px-3 py-2.5 text-[0.76rem] font-semibold text-slate-400 transition hover:text-red-600"
                      >
                        Cancelar
                      </button>
                      {passo && (
                        <button
                          type="button"
                          onClick={() => avancar(pedido)}
                          disabled={ocupado === pedido.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60"
                        >
                          {ocupado === pedido.id ? 'Um instante…' : passo}
                          <Icon name="chevron" size={14} />
                        </button>
                      )}
                      {pedido.entrega_tipo === 'transportadora' && pedido.status === 'em_separacao' && !pedido.rastreio_codigo && (
                        <button type="button" onClick={() => emitirEtiqueta(pedido)} disabled={ocupado === pedido.id}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-60">
                          {ocupado === pedido.id ? 'Emitindo…' : 'Emitir etiqueta'}
                          <Icon name="send" size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </Panel>
              )
            })}
          </div>
        </div>

        {/* ── O mês ── */}
        <div>
          <Eyebrow className="px-1 text-slate-400">Este mês</Eyebrow>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Metric label="Pedidos" value={painel?.mes.pedidos ?? 0} />
            <Metric label="Faturado" value={emReais(painel?.mes.faturado)} />
            <Metric label="A receber" value={emReais(painel?.mes.a_receber)} tone="teal" hint="já sem a comissão" />
            <Metric label="Comissão" value={emReais(painel?.mes.comissao)} tone="amber" />
          </div>
        </div>

        <Panel className="divide-y divide-slate-100 overflow-hidden">
          <NavRow
            icon="inbox"
            label="Catálogo"
            hint={`${painel?.catalogo.publicados ?? 0} na vitrine${
              painel?.catalogo.aguardando_cadastro
                ? ` · ${painel.catalogo.aguardando_cadastro} esperando preço`
                : ''
            }`}
            badge={
              painel?.catalogo.aguardando_cadastro
                ? <Badge tone="amber">{painel.catalogo.aguardando_cadastro}</Badge>
                : null
            }
            onClick={() => navigate('/mercado/loja/catalogo')}
          />
          <NavRow
            icon="send"
            label="Catálogo no WhatsApp e no Google"
            hint="Um link, os três lugares"
            onClick={() => navigate('/mercado/loja/feed')}
          />
          <NavRow
            icon="clock"
            label="Assinaturas de ração"
            hint={
              assinaturas === null
                ? 'Clientes com entrega programada'
                : `${assinaturas.filter((item) => item.status === 'ativa').length} ativa(s) · ${assinaturas.length} no total`
            }
            onClick={() => setMostrarAssinaturas((atual) => !atual)}
          />
          {mostrarAssinaturas && (
            <div className="space-y-2 bg-slate-50/60 px-4 py-3">
              {(assinaturas || []).length === 0 && (
                <p className="text-[0.74rem] text-slate-500">
                  Ninguém assinou ainda. A opção aparece na página do produto quando “Vendo ração por assinatura”
                  está ligado no cadastro da loja.
                </p>
              )}
              {(assinaturas || []).map((assinatura) => (
                <div key={assinatura.id} className="rounded-xl bg-white px-3 py-2.5 text-[0.74rem] ring-1 ring-slate-200/80">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">{assinatura.tutor?.nome || 'Cliente'}</span>
                    <Badge tone={assinatura.status === 'ativa' ? 'teal' : assinatura.status === 'pausada' ? 'amber' : 'slate'}>
                      {assinatura.status}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-slate-600">
                    {assinatura.itens.map((item) => `${item.quantidade}× ${item.produto.nome}`).join(', ')}
                  </p>
                  <p className="mt-0.5 text-[0.68rem] text-slate-400">
                    a cada {assinatura.frequencia_dias} dias · {ENTREGA[assinatura.entrega_tipo] || assinatura.entrega_tipo}
                    {assinatura.status === 'ativa'
                      ? ` · próximo ${new Date(assinatura.proximo_ciclo_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}`
                      : ''}
                    {' · '}
                    {assinatura.ciclos_pagos} pago(s) de {assinatura.ciclos_gerados}
                    {assinatura.tutor?.telefone ? ` · ${assinatura.tutor.telefone}` : ''}
                  </p>
                </div>
              ))}
            </div>
          )}
          <NavRow
            icon="edit"
            label="Cadastro da loja"
            hint="Endereço, contato, entrega, prazo de preparo"
            onClick={() => navigate('/mercado/loja')}
          />
          <NavRow icon="paw" label="Voltar ao app" hint="Minha área de tutor" onClick={() => navigate('/tutor/home')} />
        </Panel>
      </div>
    </div>
  )
}
