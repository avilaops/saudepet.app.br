import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Badge, DataRow, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import {
  emReais,
  ENTREGA,
  escreverUnidade,
  ESTADO_DO_PEDIDO,
  mercado,
  quilometros,
  type EventoDoPedido,
  type Pedido
} from '../../services/mercado'

/**
 * Um pedido do mercado, por inteiro.
 *
 * Inclui a linha do tempo — quem mudou o quê e quando —, que é a mesma ideia da
 * linha do tempo do atendimento: quando alguém pergunta "por que meu pedido
 * ainda não saiu", a resposta tem de estar na tela, não numa conversa.
 *
 * Cancelar só aparece enquanto cancelar é possível. Depois que a loja começou a
 * separar, o botão sai e no lugar dele fica o telefone dela — porque nesse
 * ponto a solução é falar com quem está com o produto na mão.
 */

const ROTULO_DO_EVENTO: Record<string, string> = {
  aguardando_pagamento: 'Pedido criado',
  pagamento_falhou: 'Pagamento não aprovado',
  pago: 'Pagamento confirmado',
  em_separacao: 'A loja começou a separar',
  pronto: 'Pedido pronto',
  concluido: 'Pedido concluído',
  cancelado: 'Pedido cancelado',
  reembolsado: 'Valor devolvido'
}

/** Quando a própria loja leva, "pronto" é o momento em que o pedido sai. */
const rotuloDoEvento = (status: string, entregaTipo: string): string => {
  if (entregaTipo === 'loja' && status === 'pronto') return 'Saiu para entrega'
  if (entregaTipo === 'loja' && status === 'concluido') return 'Entregue'
  if (entregaTipo === 'transportadora' && status === 'pronto') return 'Pedido despachado'
  if (entregaTipo === 'transportadora' && status === 'concluido') return 'Entrega concluída'
  return ROTULO_DO_EVENTO[status] || status
}

const ORIGEM = { tutor: 'você', loja: 'a loja', admin: 'a equipe', webhook: 'o pagamento', worker: 'o sistema' } as const

export default function TutorMercadoPedido() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [eventos, setEventos] = useState<EventoDoPedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  const [cancelando, setCancelando] = useState(false)
  const [abrindoCancelamento, setAbrindoCancelamento] = useState(false)
  const [motivo, setMotivo] = useState('')

  const carregar = useCallback(async () => {
    if (!id) return
    try {
      const dados = await mercado.pedido(id)
      setPedido(dados.pedido)
      setEventos(dados.eventos)
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível abrir este pedido.')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => { carregar() }, [carregar])

  const cancelar = async () => {
    if (!id || motivo.trim().length < 3) {
      setErro('Escreva o motivo do cancelamento.')
      return
    }
    setCancelando(true)
    setErro('')
    try {
      await mercado.cancelar(id, motivo.trim())
      setAbrindoCancelamento(false)
      setMotivo('')
      await carregar()
    } catch (requestError: any) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível cancelar este pedido.')
    } finally {
      setCancelando(false)
    }
  }

  if (carregando) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <PageHeader title="Pedido" onBack={() => navigate('/tutor/mercado/pedidos')} />
        <Panel className="mx-5 mt-5 px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
      </div>
    )
  }

  if (!pedido) {
    return (
      <div className="container-app min-h-screen bg-surface-page">
        <PageHeader title="Pedido" onBack={() => navigate('/tutor/mercado/pedidos')} />
        <Panel className="mx-5 mt-5 border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700">
          {erro || 'Pedido não encontrado.'}
        </Panel>
      </div>
    )
  }

  const estado = ESTADO_DO_PEDIDO[pedido.status] || { rotulo: pedido.status, tom: 'slate' as const }
  const podeCancelar = pedido.status === 'aguardando_pagamento' || pedido.status === 'pago'
  const precisaPagar = pedido.status === 'aguardando_pagamento'
  const telefone = pedido.loja.whatsapp || pedido.loja.telefone

  return (
    <div className="container-app min-h-screen bg-surface-page pb-10">
      <PageHeader
        title={pedido.codigo}
        subtitle={pedido.loja.nome_fantasia}
        onBack={() => navigate('/tutor/mercado/pedidos')}
        action={<Badge tone={estado.tom}>{estado.rotulo}</Badge>}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {precisaPagar && (
          <button
            type="button"
            onClick={() => navigate(`/tutor/mercado/pedidos/${pedido.id}/pagamento`)}
            className="flex w-full items-center gap-3 rounded-2xl bg-primary px-4 py-3.5 text-left text-white transition hover:bg-[#127e82]"
          >
            <Icon name="card" size={18} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.88rem] font-semibold">Pagar {emReais(pedido.total)}</span>
              <span className="mt-0.5 block text-[0.7rem] text-white/70">
                A loja só começa a separar depois do pagamento
              </span>
            </span>
            <Icon name="chevron" size={16} className="text-white/60" />
          </button>
        )}

        {pedido.status === 'pronto' && (
          <Panel className="border-primary/30 bg-primary/5 px-4 py-3.5">
            <div className="flex items-center gap-2">
              <Icon name="check" size={16} className="text-primary" />
              <h2 className="text-[0.88rem] font-semibold text-ink">
                {pedido.entrega_tipo === 'retirada' ? 'Pode buscar' : pedido.entrega_tipo === 'loja' ? 'Saiu para entrega' : pedido.entrega_tipo === 'transportadora' ? 'Pedido despachado' : 'Separado'}
              </h2>
            </div>
            <p className="mt-1 text-[0.74rem] leading-relaxed text-slate-600">
              {pedido.entrega_tipo === 'retirada'
                ? `${pedido.loja.endereco}${pedido.loja.bairro ? `, ${pedido.loja.bairro}` : ''} — ${pedido.loja.cidade}. Leve o código ${pedido.codigo}.`
                : pedido.entrega_tipo === 'loja'
                  ? `A ${pedido.loja.nome_fantasia} está levando para ${pedido.entrega_endereco}.`
                  : pedido.entrega_tipo === 'transportadora'
                    ? `${pedido.frete_transportadora || 'A transportadora'} está levando o pedido${pedido.rastreio_codigo ? ` · código ${pedido.rastreio_codigo}` : ''}.`
                    : 'A loja vai entrar em contato para combinar a entrega.'}
            </p>
          </Panel>
        )}

        {/* Itens */}
        <Panel className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <Eyebrow className="text-slate-400">O que você comprou</Eyebrow>
          </div>
          <ul className="divide-y divide-slate-100">
            {pedido.itens.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3 px-4 py-2.5">
                <span className="min-w-0">
                  <span className="block text-[0.82rem] text-ink">{item.nome}</span>
                  <span className="text-[0.7rem] text-slate-400">
                    {escreverUnidade(item.quantidade, item.unidade)} × {emReais(item.preco_unitario)}
                    {item.variacao ? ` · ${item.variacao}` : ''}
                  </span>
                  {item.exige_receita && (
                    <span className="mt-0.5 block text-[0.68rem] font-semibold text-amber-700">
                      exige receita veterinária
                    </span>
                  )}
                  {item.prazo_encomenda_dias && (
                    <span className="mt-0.5 block text-[0.68rem] text-amber-700">
                      sob encomenda · até {item.prazo_encomenda_dias} dia(s)
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[0.82rem] font-semibold tabular-nums text-ink">
                  {emReais(item.subtotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="border-t border-slate-100 px-4 py-1">
            <DataRow label="Subtotal" value={emReais(pedido.subtotal)} tone="slate" />
            {(pedido.entrega_tipo === 'loja' || pedido.entrega_tipo === 'transportadora') && (
              <DataRow label="Entrega" value={Number(pedido.frete) > 0 ? emReais(pedido.frete) : 'grátis'} tone="slate" />
            )}
            <DataRow label="Total" value={emReais(pedido.total)} />
          </div>
        </Panel>

        {/* Como recebe + contato da loja */}
        <Panel className="px-4 py-3.5">
          <Eyebrow className="text-slate-400">{ENTREGA[pedido.entrega_tipo] || 'Entrega'}</Eyebrow>
          <p className="mt-1.5 text-[0.78rem] leading-relaxed text-ink">
            {pedido.entrega_tipo === 'retirada'
              ? `${pedido.loja.endereco}${pedido.loja.complemento ? `, ${pedido.loja.complemento}` : ''}${pedido.loja.bairro ? ` — ${pedido.loja.bairro}` : ''}, ${pedido.loja.cidade}/${pedido.loja.estado}`
              : `${pedido.entrega_endereco || 'A combinar com a loja'}${pedido.entrega_complemento ? `, ${pedido.entrega_complemento}` : ''}`}
          </p>
          {pedido.entrega_tipo === 'loja' && (
            <p className="mt-1 text-[0.7rem] text-slate-400">
              {pedido.entrega_distancia_km != null ? `${quilometros(pedido.entrega_distancia_km)} da loja` : ''}
              {pedido.loja.entrega_prazo_horas ? ` · prazo de até ${pedido.loja.entrega_prazo_horas} h após o pagamento` : ''}
            </p>
          )}
          {pedido.entrega_tipo === 'transportadora' && (
            <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2.5 text-[0.72rem] leading-relaxed text-slate-500">
              <strong className="block font-semibold text-ink">
                {pedido.frete_transportadora || 'Transportadora'} {pedido.frete_servico?.toUpperCase() || ''}
              </strong>
              {pedido.frete_prazo && <span>{pedido.frete_prazo}</span>}
              {pedido.rastreio_codigo && <span className="mt-0.5 block font-semibold text-primary">Rastreio: {pedido.rastreio_codigo}</span>}
            </div>
          )}
          {pedido.observacao && (
            <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-[0.72rem] leading-relaxed text-slate-500">
              Sua observação: {pedido.observacao}
            </p>
          )}
          {telefone && (
            <a
              href={`tel:${telefone.replace(/\D/g, '')}`}
              className="mt-2.5 flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-[0.78rem] font-semibold text-ink ring-1 ring-slate-200/80 transition hover:bg-slate-100"
            >
              <Icon name="message" size={15} />
              Falar com a loja
            </a>
          )}
        </Panel>

        {/* Linha do tempo */}
        <Panel className="px-4 py-3.5">
          <Eyebrow className="text-slate-400">O que aconteceu</Eyebrow>
          <ol className="mt-2.5 space-y-2.5">
            {eventos.map((evento) => (
              <li key={evento.id} className="flex gap-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.78rem] font-medium text-ink">
                    {rotuloDoEvento(evento.status, pedido.entrega_tipo)}
                  </span>
                  <span className="text-[0.68rem] text-slate-400">
                    {new Date(evento.criado_em).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    {evento.origem ? ` · por ${ORIGEM[evento.origem as keyof typeof ORIGEM] || evento.origem}` : ''}
                  </span>
                  {evento.motivo && (
                    <span className="mt-0.5 block text-[0.7rem] leading-relaxed text-slate-500">{evento.motivo}</span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </Panel>

        {podeCancelar && !abrindoCancelamento && (
          <button
            type="button"
            onClick={() => setAbrindoCancelamento(true)}
            className="w-full rounded-xl bg-white px-4 py-3 text-[0.8rem] font-semibold text-slate-500 ring-1 ring-slate-200/80 transition hover:text-red-600"
          >
            Cancelar pedido
          </button>
        )}

        {abrindoCancelamento && (
          <Panel className="space-y-2.5 px-4 py-4">
            <h3 className="text-[0.86rem] font-semibold text-ink">Cancelar {pedido.codigo}</h3>
            <p className="text-[0.72rem] leading-relaxed text-slate-500">
              Os itens voltam para a prateleira da loja.
              {pedido.status === 'pago' && ' O valor pago é devolvido pelo mesmo meio de pagamento.'}
            </p>
            <textarea
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              rows={2}
              placeholder="Por que está cancelando?"
              className="w-full resize-none rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setAbrindoCancelamento(false); setMotivo('') }}
                className="flex-1 rounded-xl bg-slate-50 px-4 py-2.5 text-[0.78rem] font-semibold text-slate-500 ring-1 ring-slate-200/80"
              >
                Voltar
              </button>
              <button
                type="button"
                onClick={cancelar}
                disabled={cancelando}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
              >
                {cancelando ? 'Cancelando…' : 'Confirmar'}
              </button>
            </div>
          </Panel>
        )}

        {!podeCancelar && pedido.status !== 'cancelado' && pedido.status !== 'concluido' && (
          <p className="px-1 text-center text-[0.7rem] leading-relaxed text-slate-400">
            A loja já começou a separar este pedido. Para mudar alguma coisa, fale direto com ela.
          </p>
        )}
      </div>
    </div>
  )
}
