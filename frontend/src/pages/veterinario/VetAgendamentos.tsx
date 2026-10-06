import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader, formatDate, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'

const tabs = [
  ['pendentes', 'Pendentes'],
  ['confirmados', 'Confirmados'],
  ['finalizados', 'Finalizados'],
  ['cancelados', 'Cancelados'],
]
const statusByTab: Record<string, string[]> = {
  pendentes: ['veterinario_encontrado'],
  confirmados: ['a_caminho', 'chegou', 'atendimento_em_andamento'],
  finalizados: ['finalizado', 'concluido'],
  cancelados: ['cancelado'],
}
const emptyCopy: Record<string, string> = {
  pendentes: 'Nenhum atendimento aguardando aprovação',
  confirmados: 'Nenhum atendimento confirmado',
  finalizados: 'Nenhum atendimento finalizado',
  cancelados: 'Nenhum atendimento cancelado',
}

export default function VetAgendamentos() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState('pendentes')
  const [appointments, setAppointments] = useState<ApiPayload[]>([])
  const [counts, setCounts] = useState<ApiPayload>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [decision, setDecision] = useState<ApiPayload | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [filtered, all] = await Promise.all([
        api.get(`/solicitacoes/veterinario/por-status?status=${activeTab}`),
        api.get('/solicitacoes/veterinario/lista'),
      ])
      setAppointments(Array.isArray(filtered.data) ? filtered.data : [])
      const allItems = Array.isArray(all.data) ? all.data : []
      setCounts(Object.fromEntries(tabs.map(([key]) => [key, allItems.filter((item) => statusByTab[key].includes(item.status)).length])))
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar os agendamentos.')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => { load() }, [load])

  const finishDecision = async () => {
    if (!decision) return
    setSubmitting(true)
    setError('')
    try {
      if (decision.kind === 'confirm') await api.put(`/solicitacoes/${decision.item.id}/status`, { status: 'a_caminho' })
      else await api.put(`/solicitacoes/${decision.item.id}/recusar`, { motivo: reason.trim() || undefined })
      setDecision(null)
      setReason('')
      await load()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o atendimento.')
    } finally {
      setSubmitting(false)
    }
  }

  const statusInfo = (status: string) => {
    if (status === 'veterinario_encontrado') return ['Aguardando', 'pending']
    if (['a_caminho', 'chegou', 'atendimento_em_andamento'].includes(status)) return ['Confirmado ✓', 'confirmed']
    if (status === 'cancelado') return ['Cancelado', 'cancelled']
    return ['Finalizado', 'finished']
  }

  return (
    <main className="vet-app">
      <VetPageHeader title="Agendamentos" subtitle="Gerencie os atendimentos dos tutores" onBack={() => navigate('/veterinario/home')} />
      <div className="vet-tabs" role="tablist" aria-label="Status dos agendamentos">
        {tabs.map(([key, label]) => <button key={key} id={`tab-${key}`} role="tab" aria-selected={activeTab === key} aria-controls="appointments-panel" className={`vet-tab ${activeTab === key ? 'is-active' : ''}`} type="button" onClick={() => setActiveTab(key)}>{label}{counts[key] ? ` (${counts[key]})` : ''}</button>)}
      </div>
      <section id="appointments-panel" role="tabpanel" aria-labelledby={`tab-${activeTab}`} className="vet-list">
        {loading ? <VetLoading label="Carregando agendamentos" /> : error ? <div className="vet-card vet-empty" role="alert"><strong>{error}</strong><button className="vet-button--primary" onClick={load}>Tentar novamente</button></div> : appointments.length === 0 ? (
          <div className="vet-card vet-empty"><VetIcon name="calendar" size={38} /><strong>{emptyCopy[activeTab]}</strong></div>
        ) : appointments.map((item) => {
          const [statusLabel, statusClass] = statusInfo(item.status)
          return (
            <article className="vet-card vet-appointment" key={item.id}>
              <div className="vet-appointment__head"><span className="vet-service-icon"><VetIcon name={item.tipo_atendimento === 'teleorientacao' ? 'message' : item.tipo_atendimento === 'emergencia' ? 'bell' : 'home'} size={19} /></span><div><h2>{serviceLabel(item.tipo_atendimento)}</h2><p className="vet-appointment__pet">Pet: {item.pet?.nome || 'Não informado'} ({item.pet?.tipo || item.pet?.especie || 'animal'})</p></div><span className={`vet-status vet-status--${statusClass}`}>{statusLabel}</span></div>
              <p className="vet-appointment__line"><VetIcon name="user" size={15} /><strong>Tutor:</strong> {item.tutor?.nome || 'Não informado'}</p>
              {item.localizacao_cliente && <p className="vet-appointment__line"><VetIcon name="pin" size={15} />{item.localizacao_cliente}</p>}
              <p className="vet-appointment__line vet-appointment__schedule"><VetIcon name="calendar" size={15} />{formatDate(item.data_agendada || item.agendado_para || item.criado_em, true)}</p>
              {activeTab === 'finalizados' && <div className="vet-appointment__description"><strong>Serviços / descrição</strong><p>{item.diagnostico || item.observacoes || 'Sem descrição registrada.'}</p></div>}
              <p className="vet-appointment__line vet-appointment__value"><VetIcon name="wallet" size={15} />{item.valor_estimado ? formatMoney(item.valor_estimado) : 'Valor ainda não informado'}</p>
              {activeTab === 'pendentes' && <div className="vet-appointment__actions"><button className="vet-button--secondary" type="button" onClick={() => setDecision({ kind: 'decline', item })}>Recusar</button><button className="vet-button--primary" type="button" onClick={() => setDecision({ kind: 'confirm', item })}>Confirmar</button></div>}
            </article>
          )
        })}
      </section>
      <VetBottomNav />
      {decision && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDecision(null)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="decision-title">
            <div className="vet-modal__title">
              <VetIcon name={decision.kind === 'confirm' ? 'check' : 'close'} />
              <h2 id="decision-title">
                {decision.kind === 'confirm' ? 'Confirmar atendimento' : 'Recusar atendimento'}
              </h2>
              <button className="vet-icon-button" type="button" onClick={() => setDecision(null)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-modal__patient">
              <strong>{decision.item.pet?.nome || 'Pet'} · {decision.item.tutor?.nome || 'Tutor'}</strong>
              <small>{serviceLabel(decision.item.tipo_atendimento)}</small>
            </div>

            {decision.kind === 'decline' && (
              <div className="vet-prescription-note">
                <label htmlFor="decline-reason">Motivo (opcional)</label>
                <textarea
                  id="decline-reason"
                  maxLength={500}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Informe um motivo breve, sem dados clínicos desnecessários."
                />
              </div>
            )}

            <button className="vet-modal__submit" type="button" disabled={submitting} onClick={finishDecision}>
              {submitting ? 'Salvando…' : decision.kind === 'confirm' ? 'Confirmar atendimento' : 'Recusar atendimento'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
