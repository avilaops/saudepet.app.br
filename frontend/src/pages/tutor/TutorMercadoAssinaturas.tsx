import { useCallback, useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { emReais, mercado, type Assinatura } from '../../services/mercado'

/**
 * As assinaturas de ração do tutor.
 *
 * Cada cartão diz o que importa em uma linha: o que vem, quando vem e o que a
 * pessoa pode fazer agora — pagar o pedido aberto, pedir antes da hora, pausar
 * ou retomar. Cancelar fica atrás de uma confirmação, porque é a única ação
 * sem volta.
 */

const ESTADO: Record<string, { rotulo: string; tom: 'teal' | 'amber' | 'slate' | 'red' }> = {
  ativa: { rotulo: 'Ativa', tom: 'teal' },
  pausada: { rotulo: 'Pausada', tom: 'amber' },
  cancelada: { rotulo: 'Cancelada', tom: 'slate' }
}

const ENTREGA: Record<string, string> = {
  retirada: 'retiro na loja',
  combinar: 'entrega combinada com a loja',
  loja: 'a loja entrega em casa'
}

const dataCurta = (valor: string) =>
  new Date(valor).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function TutorMercadoAssinaturas() {
  const navigate = useNavigate()
  const location = useLocation()
  const [assinaturas, setAssinaturas] = useState<Assinatura[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState<string>((location.state as { aviso?: string } | null)?.aviso || '')
  const [ocupada, setOcupada] = useState<string | null>(null)
  const [cancelando, setCancelando] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [frequencia, setFrequencia] = useState<number>(30)

  const carregar = useCallback(async () => {
    try {
      const { assinaturas: lista } = await mercado.assinaturas()
      setAssinaturas(lista)
    } catch (requestError) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível carregar suas assinaturas.')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  const agir = async (id: string, acao: () => Promise<unknown>, mensagem?: string) => {
    setOcupada(id)
    setErro('')
    try {
      await acao()
      if (mensagem) setAviso(mensagem)
      await carregar()
    } catch (requestError) {
      const resposta = (requestError as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível concluir. Tente de novo.')
    } finally {
      setOcupada(null)
      setCancelando(null)
      setEditando(null)
    }
  }

  const pedirAgora = (id: string) =>
    agir(id, async () => {
      const { pedido } = await mercado.pedirAgoraDaAssinatura(id)
      if (pedido) navigate(`/tutor/mercado/pedidos/${pedido.id}/pagamento`)
    })

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader title="Minhas assinaturas" subtitle="Ração com entrega programada" onBack={() => navigate('/tutor/mercado')} />

      <div className="space-y-3 px-5 py-5">
        {aviso && (
          <div role="status" className="flex items-start justify-between gap-3 rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-[0.76rem] text-ink">
            <span>{aviso}</span>
            <button type="button" onClick={() => setAviso('')} className="shrink-0 text-slate-400" aria-label="Fechar aviso">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {carregando && <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>}

        {!carregando && assinaturas.length === 0 && !erro && (
          <EmptyState
            icon="clock"
            title="Nenhuma assinatura"
            description="Na página de um produto, toque em “Assinar” para receber a ração no seu ritmo, com desconto de assinante."
          />
        )}

        {assinaturas.map((assinatura) => {
          const estado = ESTADO[assinatura.status] || { rotulo: assinatura.status, tom: 'slate' as const }
          const itens = assinatura.itens.map((item) => `${item.quantidade}× ${item.produto.nome}`).join(', ')
          const trabalhando = ocupada === assinatura.id
          const temPedidoAberto = Boolean(assinatura.ultimo_pedido_id) && assinatura.ciclos_gerados > assinatura.ciclos_pagos
          const valorPorCiclo = assinatura.itens.reduce((total, item) => {
            const promocional = item.produto.preco_promocional == null ? null : Number(item.produto.preco_promocional)
            const preco = promocional && promocional > 0 && promocional < Number(item.produto.preco) ? promocional : Number(item.produto.preco)
            return total + preco * item.quantidade
          }, 0)
          const comDesconto = valorPorCiclo * (1 - Number(assinatura.desconto_pct || 0) / 100)

          return (
            <Panel key={assinatura.id} className="overflow-hidden">
              <div className="px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[0.86rem] font-semibold text-ink">{assinatura.loja.nome_fantasia}</span>
                      <Badge tone={estado.tom}>{estado.rotulo}</Badge>
                    </div>
                    <p className="mt-0.5 text-[0.76rem] text-slate-600">{itens}</p>
                    <p className="mt-1 text-[0.7rem] text-slate-400">
                      a cada {assinatura.frequencia_dias} dias · {ENTREGA[assinatura.entrega_tipo] || assinatura.entrega_tipo}
                      {assinatura.pet ? ` · ${assinatura.pet.nome}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="block text-[0.92rem] font-semibold tabular-nums text-ink">{emReais(comDesconto)}</span>
                    {Number(assinatura.desconto_pct) > 0 && (
                      <span className="block text-[0.66rem] text-primary">-{Number(assinatura.desconto_pct)}% assinante</span>
                    )}
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[0.72rem] text-slate-500">
                  {assinatura.status === 'ativa' && (
                    <span>
                      <Icon name="clock" size={12} className="mr-1 inline text-slate-300" />
                      próximo pedido {dataCurta(assinatura.proximo_ciclo_em)}
                    </span>
                  )}
                  <span>{assinatura.ciclos_pagos} pago{assinatura.ciclos_pagos === 1 ? '' : 's'} de {assinatura.ciclos_gerados}</span>
                  {assinatura.status === 'pausada' && assinatura.ultimo_erro && (
                    <span className="text-amber-700">{assinatura.ultimo_erro}</span>
                  )}
                  {assinatura.status === 'ativa' && assinatura.ultimo_erro && (
                    <span className="text-amber-700">último ciclo adiado: {assinatura.ultimo_erro}</span>
                  )}
                </div>

                {editando === assinatura.id && (
                  <div className="mt-3 flex items-end gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                    <label className="block flex-1 space-y-1">
                      <span className="text-[0.66rem] font-semibold uppercase tracking-wide text-slate-400">A cada (dias)</span>
                      <input
                        type="number"
                        min={7}
                        max={90}
                        value={frequencia}
                        onChange={(evento) => setFrequencia(Number(evento.target.value) || 7)}
                        className="w-full rounded-lg border border-slate-200/80 bg-white px-3 py-2 text-[0.8rem] outline-none focus:border-primary"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={trabalhando}
                      onClick={() => agir(assinatura.id, () => mercado.alterarAssinatura(assinatura.id, { frequencia_dias: frequencia }), 'Frequência atualizada.')}
                      className="rounded-lg bg-primary px-3 py-2 text-[0.74rem] font-semibold text-white disabled:opacity-60"
                    >
                      Salvar
                    </button>
                    <button type="button" onClick={() => setEditando(null)} className="rounded-lg px-3 py-2 text-[0.74rem] font-semibold text-slate-500">
                      Cancelar
                    </button>
                  </div>
                )}

                {cancelando === assinatura.id && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[0.74rem] text-red-800">
                    <p>Cancelar a assinatura? Pedidos já gerados continuam de pé; nenhum novo será criado.</p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={trabalhando}
                        onClick={() => agir(assinatura.id, () => mercado.cancelarAssinatura(assinatura.id, 'Cancelada pelo tutor'), 'Assinatura cancelada.')}
                        className="rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white disabled:opacity-60"
                      >
                        Confirmar
                      </button>
                      <button type="button" onClick={() => setCancelando(null)} className="rounded-lg px-3 py-1.5 font-semibold text-red-700">
                        Voltar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {assinatura.status !== 'cancelada' && (
                <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                  {temPedidoAberto && assinatura.ultimo_pedido_id && (
                    <button
                      type="button"
                      onClick={() => navigate(`/tutor/mercado/pedidos/${assinatura.ultimo_pedido_id}`)}
                      className="rounded-lg bg-primary px-3 py-1.5 text-[0.72rem] font-semibold text-white"
                    >
                      Ver pedido aberto
                    </button>
                  )}
                  {assinatura.status === 'ativa' && (
                    <>
                      <button type="button" disabled={trabalhando} onClick={() => pedirAgora(assinatura.id)} className="rounded-lg bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-ink ring-1 ring-slate-200/80 disabled:opacity-60">
                        Pedir agora
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFrequencia(assinatura.frequencia_dias)
                          setEditando(editando === assinatura.id ? null : assinatura.id)
                        }}
                        className="rounded-lg bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-ink ring-1 ring-slate-200/80"
                      >
                        Mudar frequência
                      </button>
                      <button type="button" disabled={trabalhando} onClick={() => agir(assinatura.id, () => mercado.pausarAssinatura(assinatura.id), 'Assinatura pausada.')} className="rounded-lg bg-white px-3 py-1.5 text-[0.72rem] font-semibold text-amber-700 ring-1 ring-amber-200 disabled:opacity-60">
                        Pausar
                      </button>
                    </>
                  )}
                  {assinatura.status === 'pausada' && (
                    <button type="button" disabled={trabalhando} onClick={() => agir(assinatura.id, () => mercado.retomarAssinatura(assinatura.id), 'Assinatura retomada.')} className="rounded-lg bg-primary px-3 py-1.5 text-[0.72rem] font-semibold text-white disabled:opacity-60">
                      Retomar
                    </button>
                  )}
                  <button type="button" onClick={() => setCancelando(cancelando === assinatura.id ? null : assinatura.id)} className="ml-auto rounded-lg px-3 py-1.5 text-[0.72rem] font-semibold text-red-600">
                    Cancelar
                  </button>
                </div>
              )}
            </Panel>
          )
        })}
      </div>

      <TutorBottomNav />
    </div>
  )
}
