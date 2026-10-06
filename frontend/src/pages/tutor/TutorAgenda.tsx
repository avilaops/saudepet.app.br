import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'

/**
 * Consultas marcadas do tutor.
 *
 * O veterinário já marcava pelo CRM e o tutor recebia o e-mail, mas não tinha
 * onde ver nem como confirmar — a confirmação existia só na API. Esta é a tela
 * que fecha esse laço: diferente da solicitação de plantão ("primeiro que
 * aceitar"), aqui a consulta já nasce com dono, hora e um profissional
 * esperando resposta.
 */

const STATUS: Record<string, { rotulo: string; tom: 'teal' | 'slate' | 'amber' | 'red' }> = {
  pendente: { rotulo: 'Aguardando sua confirmação', tom: 'amber' },
  confirmado: { rotulo: 'Confirmada', tom: 'teal' },
  concluido: { rotulo: 'Concluída', tom: 'slate' },
  cancelado: { rotulo: 'Cancelada', tom: 'red' },
  nao_compareceu: { rotulo: 'Não compareceu', tom: 'red' }
}

const TIPOS: Record<string, string> = {
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleconsulta',
  emergencia: 'Emergência'
}

const formatarDia = (valor: string) => new Date(valor).toLocaleDateString('pt-BR', {
  weekday: 'long', day: '2-digit', month: 'long'
})
const formatarHora = (valor: string) => new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function TutorAgenda() {
  const navigate = useNavigate()
  const [agendamentos, setAgendamentos] = useState<ApiPayload[]>([])
  const [passados, setPassados] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [agindo, setAgindo] = useState('')

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const { data } = await api.get(`/v1/agenda/meus-agendamentos${passados ? '?passados=1' : ''}`)
      setAgendamentos(data.agendamentos || [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar suas consultas.')
    } finally {
      setCarregando(false)
    }
  }, [passados])

  useEffect(() => { carregar() }, [carregar])

  const confirmar = async (agendamento: ApiPayload) => {
    setAgindo(agendamento.id)
    setErro('')
    try {
      await api.put(`/v1/agenda/agendamentos/${agendamento.id}/confirmar`)
      await carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível confirmar a consulta.')
    } finally {
      setAgindo('')
    }
  }

  const cancelar = async (agendamento: ApiPayload) => {
    const motivo = window.prompt('Por que você precisa cancelar? (o veterinário vai ver)')
    if (motivo === null) return
    setAgindo(agendamento.id)
    setErro('')
    try {
      await api.put(`/v1/agenda/agendamentos/${agendamento.id}/cancelar`, { motivo: motivo.trim() || undefined })
      await carregar()
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível cancelar a consulta.')
    } finally {
      setAgindo('')
    }
  }

  const cartao = (agendamento: ApiPayload) => {
    const status = STATUS[agendamento.status] || { rotulo: agendamento.status, tom: 'slate' }
    const aguardando = agendamento.status === 'pendente'
    const podeMexer = ['pendente', 'confirmado'].includes(agendamento.status)
    const ocupado = agindo === agendamento.id

    return (
      <Panel key={agendamento.id} className="space-y-3 px-4 py-4">
        <div className="flex items-start gap-3">
          <span className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-xl border ${
            aguardando ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200/80 bg-slate-50 text-ink'
          }`}>
            <Icon name="clock" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.88rem] font-semibold tracking-tight text-ink">
              {formatarHora(agendamento.inicio)} · {agendamento.pet?.nome || 'Seu pet'}
            </p>
            <p className="mt-0.5 text-[0.72rem] text-slate-400">
              Dr(a). {agendamento.veterinario?.usuario?.nome || 'Veterinário'}
              {agendamento.veterinario?.especialidade ? ` · ${agendamento.veterinario.especialidade}` : ''}
            </p>
            <p className="mt-0.5 text-[0.72rem] text-slate-400">
              {TIPOS[agendamento.tipo_atendimento] || 'Atendimento'}
            </p>
          </div>
          <Badge tone={status.tom}>{status.rotulo}</Badge>
        </div>

        {agendamento.observacoes && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-[0.74rem] leading-relaxed text-slate-600">
            {agendamento.observacoes}
          </p>
        )}

        {agendamento.status === 'cancelado' && agendamento.motivo_cancelamento && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-[0.74rem] leading-relaxed text-red-700">
            Motivo: {agendamento.motivo_cancelamento}
          </p>
        )}

        {podeMexer && (
          <div className="flex gap-2">
            {aguardando && (
              <button
                onClick={() => confirmar(agendamento)}
                disabled={ocupado}
                className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-[0.78rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-50"
              >
                {ocupado ? 'Confirmando…' : 'Confirmar presença'}
              </button>
            )}
            <button
              onClick={() => cancelar(agendamento)}
              disabled={ocupado}
              className={`rounded-xl border border-slate-200/80 px-4 py-2.5 text-[0.78rem] font-semibold text-slate-500 transition hover:bg-slate-50 disabled:opacity-50 ${aguardando ? '' : 'flex-1'}`}
            >
              Cancelar
            </button>
          </div>
        )}
      </Panel>
    )
  }

  // Agrupar por dia: a pergunta do tutor é "o que tenho marcado e quando",
  // não "qual a lista cronológica corrida".
  const porDia = agendamentos.reduce((grupos, item) => {
    const chave = formatarDia(item.inicio)
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave).push(item)
    return grupos
  }, new Map())

  const aguardandoConfirmacao = agendamentos.filter((item) => item.status === 'pendente').length

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Minhas consultas"
        subtitle="Consultas marcadas com hora certa"
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* Até agora o tutor só confirmava ou cancelava o que o veterinário
            criasse: para marcar um check-up, precisava ligar. */}
        <button
          type="button"
          onClick={() => navigate('/tutor/marcar-consulta')}
          className="w-full rounded-2xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:opacity-90"
        >
          Marcar nova consulta
        </button>

        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}

        {aguardandoConfirmacao > 0 && !passados && (
          <div className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Icon name="alert" size={17} className="shrink-0 text-amber-700" />
            <p className="text-[0.76rem] leading-relaxed text-amber-800">
              {aguardandoConfirmacao === 1
                ? 'Uma consulta espera sua confirmação. O veterinário reservou esse horário para você.'
                : `${aguardandoConfirmacao} consultas esperam sua confirmação.`}
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setPassados(false)}
            className={`flex-1 rounded-2xl px-4 py-3 text-[0.8rem] font-semibold transition ${
              !passados ? 'bg-ink text-white' : 'border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            Próximas
          </button>
          <button
            onClick={() => setPassados(true)}
            className={`flex-1 rounded-2xl px-4 py-3 text-[0.8rem] font-semibold transition ${
              passados ? 'bg-ink text-white' : 'border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50'
            }`}
          >
            Anteriores
          </button>
        </div>

        {carregando ? (
          <div className="py-14 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
          </div>
        ) : agendamentos.length === 0 ? (
          <EmptyState
            icon="clock"
            title={passados ? 'Nenhuma consulta anterior' : 'Nenhuma consulta marcada'}
            description={passados
              ? 'As consultas que já aconteceram ficam guardadas aqui.'
              : 'Quando um veterinário marcar um retorno com você, ele aparece aqui para você confirmar. Para atendimento agora, use "Chamar veterinário".'}
          />
        ) : (
          [...porDia.entries()].map(([dia, itens]) => (
            <section key={dia} className="space-y-2">
              <Eyebrow className="px-1 text-slate-400">{dia}</Eyebrow>
              <div className="space-y-2">{itens.map(cartao)}</div>
            </section>
          ))
        )}
      </div>

      <TutorBottomNav />
    </div>
  )
}
