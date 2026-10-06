import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'
import { ehFaltaDePlano, statusAgendamentoLabel, tipoAgendamentoLabel } from '../../components/veterinario/VetCrm'

const TIPOS_CONSULTA = [
  ['consulta_domiciliar', 'Consulta domiciliar'],
  ['teleorientacao', 'Teleconsulta'],
]

const statusClasse = (status: string) => ({
  confirmado: 'vet-status--confirmed',
  concluido: 'vet-status--confirmed',
  cancelado: 'vet-status--cancelled',
  nao_compareceu: 'vet-status--cancelled',
}[status] || 'vet-status--pending')

const chaveDoDia = (data: ApiPayload) => new Date(data).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
const hora = (data: ApiPayload) => new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

const FORM_VAZIO = { tutor: null, pet_id: '', tipo: 'consulta_domiciliar', data: '', inicio: '', duracao: 60, observacoes: '' }

export default function VetCrmAgenda() {
  const navigate = useNavigate()
  const location = useLocation()
  const [agendamentos, setAgendamentos] = useState<ApiPayload[]>([])
  const [passados, setPassados] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // O modal já abre com o cliente escolhido quando se chega pela ficha dele.
  const [novoAberto, setNovoAberto] = useState(Boolean(location.state?.tutor))
  const [form, setForm] = useState<ApiPayload>({ ...FORM_VAZIO, tutor: location.state?.tutor || null })
  const [buscaCliente, setBuscaCliente] = useState('')
  const [clientesEncontrados, setClientesEncontrados] = useState<ApiPayload[]>([])
  const [slots, setSlots] = useState<ApiPayload | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [iniciandoId, setIniciandoId] = useState<ApiPayload | null>(null)
  const [erroModal, setErroModal] = useState('')
  const buscaTimer = useRef<any>(null)

  // Cancelamento: o motivo vai para o tutor, então ele merece um campo de
  // verdade — o window.prompt do navegador era o único diálogo nativo da área,
  // sem rótulo, sem contexto e sem o nome de quem seria cancelado.
  const [cancelando, setCancelando] = useState<ApiPayload | null>(null)
  const [motivoCancelamento, setMotivoCancelamento] = useState('')
  const [salvandoCancelamento, setSalvandoCancelamento] = useState(false)
  const [erroCancelamento, setErroCancelamento] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams()
      if (passados) {
        params.set('de', new Date(Date.now() - 90 * 86400000).toISOString())
        params.set('ate', new Date().toISOString())
      }
      const response = await api.get(`/v1/veterinario/crm/agendamentos?${params}`)
      const lista = response.data?.agendamentos || []
      setAgendamentos(passados ? [...lista].reverse() : lista)
    } catch (requestError: any) {
      setError(ehFaltaDePlano(requestError)
        ? 'A agenda está disponível em outro plano — conheça no Clube Vet.'
        : requestError.response?.data?.error || 'Não foi possível carregar a agenda.')
    } finally { setLoading(false) }
  }, [passados])
  useEffect(() => { carregar() }, [carregar])

  // Busca de cliente dentro do modal, com pausa de digitação.
  useEffect(() => {
    if (!novoAberto || form.tutor) return undefined
    if (buscaTimer.current) clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ por_pagina: '8' })
        if (buscaCliente.trim()) params.set('busca', buscaCliente.trim())
        const response = await api.get(`/v1/veterinario/crm/clientes?${params}`)
        setClientesEncontrados(response.data?.clientes || [])
      } catch { setClientesEncontrados([]) }
    }, buscaCliente ? 300 : 0)
    return () => {
      if (buscaTimer.current) clearTimeout(buscaTimer.current)
    }
  }, [novoAberto, form.tutor, buscaCliente])

  // Horários livres do dia escolhido. Lista vazia não bloqueia: vet sem grade
  // cadastrada marca em qualquer horário, então o campo manual continua ali.
  useEffect(() => {
    if (!form.data) { setSlots(null); return }
    api.get(`/v1/veterinario/crm/agendamentos/horarios-livres?data=${form.data}&duracao=${form.duracao}`)
      .then((response) => setSlots(response.data?.horarios || []))
      .catch(() => setSlots([]))
  }, [form.data, form.duracao])

  const grupos = useMemo(() => {
    const porDia = new Map()
    for (const item of agendamentos) {
      const chave = chaveDoDia(item.inicio)
      if (!porDia.has(chave)) porDia.set(chave, [])
      porDia.get(chave).push(item)
    }
    return [...porDia.entries()]
  }, [agendamentos])

  // A consulta marcada vira atendimento de verdade (com prontuário, receita e
  // cobrança) — antes "Concluir" era só um carimbo na agenda, sem registro
  // clínico nenhum do outro lado.
  const iniciarAtendimento = async (agendamento: ApiPayload) => {
    setError('')
    setIniciandoId(agendamento.id)
    try {
      const { data } = await api.post(`/v1/veterinario/crm/agendamentos/${agendamento.id}/iniciar-atendimento`)
      const id = data?.solicitacao?.id
      if (id) navigate(`/veterinario/atendimento/${id}`)
      else await carregar()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível abrir o atendimento desta consulta.')
    } finally {
      setIniciandoId(null)
    }
  }

  const mudarStatus = async (agendamento: ApiPayload, status: string, motivo?: string) => {
    setError('')
    try {
      await api.put(`/v1/veterinario/crm/agendamentos/${agendamento.id}/status`, { status, motivo })
      await carregar()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível atualizar o agendamento.')
    }
  }

  const abrirCancelamento = (agendamento: ApiPayload) => {
    setCancelando(agendamento)
    setMotivoCancelamento('')
    setErroCancelamento('')
  }

  const fecharCancelamento = () => {
    setCancelando(null)
    setMotivoCancelamento('')
    setErroCancelamento('')
  }

  const confirmarCancelamento = async () => {
    if (!cancelando) return
    setSalvandoCancelamento(true)
    setErroCancelamento('')
    try {
      await api.put(`/v1/veterinario/crm/agendamentos/${cancelando.id}/status`, {
        status: 'cancelado',
        motivo: motivoCancelamento.trim() || undefined,
      })
      fecharCancelamento()
      await carregar()
    } catch (requestError: any) {
      setErroCancelamento(requestError.response?.data?.error || 'Não foi possível cancelar a consulta.')
    } finally {
      setSalvandoCancelamento(false)
    }
  }

  const criarAgendamento = async () => {
    setSalvando(true); setErroModal('')
    try {
      await api.post('/v1/veterinario/crm/agendamentos', {
        tutor_id: form.tutor.id,
        pet_id: form.pet_id,
        tipo_atendimento: form.tipo,
        inicio: new Date(`${form.data}T${form.inicio}`).toISOString(),
        duracao_minutos: Number(form.duracao),
        observacoes: form.observacoes || undefined,
      })
      setNovoAberto(false)
      setForm({ ...FORM_VAZIO })
      await carregar()
    } catch (requestError: any) {
      setErroModal(ehFaltaDePlano(requestError)
        ? 'A agenda está disponível em outro plano — conheça no Clube Vet.'
        : requestError.response?.data?.error || 'Não foi possível criar o agendamento.')
    } finally { setSalvando(false) }
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Agenda de consultas"
        subtitle="Consultas marcadas com hora certa"
        onBack={() => navigate('/veterinario/clientes')}
        action={<button className="vet-icon-button" type="button" onClick={() => setNovoAberto(true)} aria-label="Nova consulta"><VetIcon name="plus" size={18} /></button>}
      />
      <div className="vet-app-main">
        <div className="vet-policy">
          <strong>Sua grade semanal</strong>
          Os horários oferecidos seguem a grade que você define em <Link to="/veterinario/agenda">disponibilidade semanal</Link>. Sem grade cadastrada, qualquer horário vale.
          Na hora marcada a consulta vira atendimento sozinha — ou toque em "Iniciar atendimento" para começar antes.
        </div>

        <div className="vet-tabs" role="tablist">
          <button className={`vet-tab ${!passados ? 'is-active' : ''}`} type="button" role="tab" aria-selected={!passados} onClick={() => setPassados(false)}>Próximas</button>
          <button className={`vet-tab ${passados ? 'is-active' : ''}`} type="button" role="tab" aria-selected={passados} onClick={() => setPassados(true)}>Últimos 90 dias</button>
        </div>

        {error && <p className="vet-card vet-request" role="alert">{error}</p>}
        {loading ? <VetLoading label="Carregando agenda" /> : (
          <section className="vet-list">
            {grupos.length === 0 && (
              <div className="vet-card vet-empty">
                <VetIcon name="calendar" size={38} />
                <strong>{passados ? 'Nada nos últimos 90 dias' : 'Nenhuma consulta marcada'}</strong>
                {!passados && <p>Marque uma consulta futura para um cliente seu — diferente do plantão, aqui já nasce com dono e hora certa.</p>}
              </div>
            )}
            {grupos.map(([dia, itens]) => (
              <div key={dia} className="vet-crm-dia">
                <h2>{dia}</h2>
                {itens.map((agendamento: ApiPayload) => (
                  <article className="vet-card vet-crm-agendamento" key={agendamento.id}>
                    <div className="vet-crm-agendamento__head">
                      <strong>{hora(agendamento.inicio)}–{hora(agendamento.fim)}</strong>
                      <span className={`vet-status ${statusClasse(agendamento.status)}`}>{statusAgendamentoLabel(agendamento.status)}</span>
                    </div>
                    <p>
                      <strong>{agendamento.pet?.nome || 'Pet'}</strong> · {agendamento.tutor?.nome} · {tipoAgendamentoLabel(agendamento.tipo_atendimento)}
                      {agendamento.observacoes && <small>{agendamento.observacoes}</small>}
                    </p>
                    {['pendente', 'confirmado'].includes(agendamento.status) && (
                      <div className="vet-crm-agendamento__actions">
                        {agendamento.status === 'pendente' && <button type="button" onClick={() => mudarStatus(agendamento, 'confirmado')}>Confirmar</button>}
                        {agendamento.solicitacao_id
                          ? <button type="button" onClick={() => navigate(`/veterinario/atendimento/${agendamento.solicitacao_id}`)}>Abrir atendimento</button>
                          : <button type="button" disabled={iniciandoId === agendamento.id} onClick={() => iniciarAtendimento(agendamento)}>{iniciandoId === agendamento.id ? 'Abrindo…' : 'Iniciar atendimento'}</button>}
                        {agendamento.status === 'confirmado' && !agendamento.solicitacao_id && <button type="button" onClick={() => mudarStatus(agendamento, 'concluido')}>Concluir</button>}
                        {agendamento.status === 'confirmado' && <button type="button" onClick={() => mudarStatus(agendamento, 'nao_compareceu')}>Não veio</button>}
                        <button type="button" className="is-danger" onClick={() => abrirCancelamento(agendamento)}>Cancelar</button>
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ))}
          </section>
        )}
      </div>

      {novoAberto && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="nova-consulta-title">
            <div className="vet-modal__title">
              <VetIcon name="calendar" />
              <h2 id="nova-consulta-title">Nova consulta</h2>
              <button className="vet-icon-button" type="button" onClick={() => { setNovoAberto(false); setErroModal('') }} aria-label="Fechar"><VetIcon name="close" size={18} /></button>
            </div>
            {erroModal && <p className="vet-card vet-request" role="alert">{erroModal}</p>}
            <div className="vet-prescription-note">
              {form.tutor ? (
                <div className="vet-crm-cliente-escolhido">
                  <span><strong>{form.tutor.nome}</strong></span>
                  <button type="button" onClick={() => setForm({ ...form, tutor: null, pet_id: '' })}>Trocar</button>
                </div>
              ) : (
                <>
                  <label>Cliente<input className="input" type="search" placeholder="Buscar na sua clientela" value={buscaCliente} onChange={(event) => setBuscaCliente(event.target.value)} /></label>
                  <div className="vet-crm-busca-clientes">
                    {clientesEncontrados.map((cliente) => (
                      <button key={cliente.id} type="button" onClick={() => setForm({ ...form, tutor: cliente.tutor, pet_id: cliente.tutor.pets?.length === 1 ? cliente.tutor.pets[0].id : '' })}>
                        <strong>{cliente.apelido || cliente.tutor.nome}</strong>
                        <small>{cliente.tutor.pets?.map((pet: ApiPayload) => pet.nome).join(', ') || 'Sem pets'}</small>
                      </button>
                    ))}
                    {clientesEncontrados.length === 0 && <p className="vet-review-pending">Nenhum cliente encontrado — a clientela nasce dos seus atendimentos.</p>}
                  </div>
                </>
              )}
              {form.tutor && (
                <>
                  <label>Pet
                    <select className="input" value={form.pet_id} onChange={(event) => setForm({ ...form, pet_id: event.target.value })}>
                      <option value="">Escolha o pet</option>
                      {form.tutor.pets?.map((pet: ApiPayload) => <option key={pet.id} value={pet.id}>{pet.nome}</option>)}
                    </select>
                  </label>
                  <label>Tipo
                    <select className="input" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
                      {TIPOS_CONSULTA.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                    </select>
                  </label>
                  <label>Data<input className="input" type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value, inicio: '' })} /></label>
                  <label>Duração
                    <select className="input" value={form.duracao} onChange={(event) => setForm({ ...form, duracao: event.target.value, inicio: '' })}>
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={90}>1h30</option>
                      <option value={120}>2 horas</option>
                    </select>
                  </label>
                  {slots?.length > 0 && (
                    <div className="vet-crm-slots" role="group" aria-label="Horários livres">
                      {slots.map((slot: ApiPayload) => {
                        const valor = hora(slot.inicio)
                        return (
                          <button key={slot.inicio} type="button" className={form.inicio === valor ? 'is-active' : ''} onClick={() => setForm({ ...form, inicio: valor })}>
                            {valor}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {slots !== null && slots.length === 0 && form.data && (
                    <label>Horário<input className="input" type="time" value={form.inicio} onChange={(event) => setForm({ ...form, inicio: event.target.value })} /></label>
                  )}
                  <label>Observações (opcional)<textarea className="input" rows={2} value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} /></label>
                </>
              )}
            </div>
            <button
              className="vet-modal__submit"
              type="button"
              disabled={salvando || !form.tutor || !form.pet_id || !form.data || !form.inicio}
              onClick={criarAgendamento}
            >
              {salvando ? 'Marcando…' : form.data && form.inicio ? `Marcar para ${form.data.split('-').reverse().join('/')} às ${form.inicio}` : 'Marcar consulta'}
            </button>
          </section>
        </div>
      )}

      {cancelando && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="cancelar-consulta-title">
            <div className="vet-modal__title">
              <VetIcon name="close" />
              <h2 id="cancelar-consulta-title">Cancelar consulta</h2>
              <button className="vet-icon-button" type="button" onClick={fecharCancelamento} aria-label="Fechar"><VetIcon name="close" size={18} /></button>
            </div>
            {erroCancelamento && <p className="vet-card vet-request" role="alert">{erroCancelamento}</p>}
            <div className="vet-prescription-note">
              <p>
                <strong>{cancelando.pet?.nome || 'Pet'}</strong> · {cancelando.tutor?.nome}
                <small>{hora(cancelando.inicio)}–{hora(cancelando.fim)} · {chaveDoDia(cancelando.inicio)}</small>
              </p>
              <label>
                Motivo do cancelamento
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Ex.: imprevisto na agenda, remarcaremos em seguida"
                  value={motivoCancelamento}
                  onChange={(event) => setMotivoCancelamento(event.target.value)}
                />
              </label>
              <p className="vet-review-pending">O tutor pode ver este texto. Deixe em branco se preferir não justificar.</p>
            </div>
            <div className="vet-crm-agendamento__actions">
              <button type="button" onClick={fecharCancelamento} disabled={salvandoCancelamento}>Manter consulta</button>
            </div>
            <button
              className="vet-modal__submit"
              type="button"
              disabled={salvandoCancelamento}
              onClick={confirmarCancelamento}
            >
              {salvandoCancelamento ? 'Cancelando…' : 'Confirmar cancelamento'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
