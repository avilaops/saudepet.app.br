import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { emReais, ESTADO_DO_PEDIDO, mercado, type Pedido } from '../../services/mercado'

/**
 * Os pedidos do mercado, do mais recente para o mais antigo.
 *
 * O que o pedido está esperando aparece na própria linha — "pague para a loja
 * separar", "pode buscar" — porque um selo de estado sozinho não diz de quem é
 * a vez de agir.
 */

const PROXIMO_PASSO: Record<string, string> = {
  aguardando_pagamento: 'Pague para a loja começar a separar',
  pagamento_falhou: 'O pagamento não passou — monte o carrinho de novo',
  pago: 'A loja foi avisada e vai separar',
  em_separacao: 'A loja está separando',
  pronto: 'Pronto para buscar',
  concluido: 'Entregue',
  cancelado: 'Cancelado',
  reembolsado: 'Valor devolvido'
}

export default function TutorMercadoPedidos() {
  const navigate = useNavigate()
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')

  useEffect(() => {
    mercado
      .pedidos()
      .then(({ pedidos: lista }) => setPedidos(lista))
      .catch((requestError) => {
        const resposta = (requestError as { response?: { data?: { error?: string } } }).response
        setErro(resposta?.data?.error || 'Não foi possível carregar seus pedidos.')
      })
      .finally(() => setCarregando(false))
  }, [])

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Meus pedidos"
        subtitle="Saúde Pet Mercado"
        onBack={() => navigate('/tutor/mercado')}
        action={
          <button
            type="button"
            onClick={() => navigate('/tutor/mercado/assinaturas')}
            className="rounded-xl bg-primary/10 px-3 py-2 text-[0.74rem] font-semibold text-primary transition hover:bg-primary/15"
          >
            Assinaturas
          </button>
        }
      />

      <div className="space-y-3 px-5 py-5">
        {erro && <Panel className="border-red-200 bg-red-50 px-4 py-3 text-[0.76rem] text-red-700">{erro}</Panel>}

        {carregando && (
          <Panel className="px-4 py-8 text-center text-[0.78rem] text-slate-400">Carregando…</Panel>
        )}

        {!carregando && pedidos.length === 0 && !erro && (
          <EmptyState
            icon="inbox"
            title="Nenhum pedido ainda"
            description="O que você comprar no mercado aparece aqui, com o estado de cada um."
          />
        )}

        {pedidos.map((pedido) => {
          const estado = ESTADO_DO_PEDIDO[pedido.status] || { rotulo: pedido.status, tom: 'slate' as const }
          const precisaPagar = pedido.status === 'aguardando_pagamento'

          return (
            <Panel key={pedido.id} className="overflow-hidden">
              <button
                type="button"
                onClick={() => navigate(`/tutor/mercado/pedidos/${pedido.id}`)}
                className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[0.86rem] font-semibold text-ink">
                      {pedido.loja.nome_fantasia}
                    </span>
                    <Badge tone={estado.tom}>{estado.rotulo}</Badge>
                    {pedido.assinatura_id && <Badge tone="teal">assinatura</Badge>}
                  </span>
                  <span className="mt-0.5 block text-[0.72rem] text-slate-400">
                    {pedido.codigo} ·{' '}
                    {new Date(pedido.criado_em).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} ·{' '}
                    {pedido.itens.length} {pedido.itens.length === 1 ? 'item' : 'itens'}
                  </span>
                  <span className="mt-1 block text-[0.74rem] text-slate-500">{PROXIMO_PASSO[pedido.status]}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-[0.92rem] font-semibold tabular-nums text-ink">
                    {emReais(pedido.total)}
                  </span>
                  <Icon name="chevron" size={15} className="ml-auto mt-1 text-slate-300" />
                </span>
              </button>

              {precisaPagar && (
                <button
                  type="button"
                  onClick={() => navigate(`/tutor/mercado/pedidos/${pedido.id}/pagamento`)}
                  className="w-full border-t border-slate-100 bg-primary/5 px-4 py-2.5 text-[0.78rem] font-semibold text-primary transition hover:bg-primary/10"
                >
                  Pagar agora
                </button>
              )}
            </Panel>
          )
        })}
      </div>

      <TutorBottomNav />
    </div>
  )
}
