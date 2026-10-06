import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetAvatar, VetIcon, VetLoading, VetPageHeader, formatDate } from '../../components/veterinario/VetUI'
import { CrmUpgrade, TIPOS_LEMBRETE, ehFaltaDePlano } from '../../components/veterinario/VetCrm'

const JANELAS = [[90, '3 meses'], [180, '6 meses'], [365, '1 ano']]
const FORM_VAZIO = { titulo: '', tipo: 'checkup', data: '', mensagem: '' }

export default function VetCrmRetencao() {
  const navigate = useNavigate()
  const [aba, setAba] = useState('inativos')
  const [dias, setDias] = useState(180)
  const [inativos, setInativos] = useState<ApiPayload[]>([])
  const [lembretes, setLembretes] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [bloqueado, setBloqueado] = useState(false)
  const [error, setError] = useState('')

  // Seleção da campanha: tutor marcado + qual pet recebe o lembrete.
  const [selecionados, setSelecionados] = useState(new Map())
  const [campanhaAberta, setCampanhaAberta] = useState(false)
  const [form, setForm] = useState<ApiPayload>({ ...FORM_VAZIO })
  const [enviando, setEnviando] = useState(false)
  const [resultado, setResultado] = useState<ApiPayload | null>(null)

  const carregar = useCallback(async () => {
    setLoading(true); setError(''); setBloqueado(false)
    try {
      const [inativosResponse, lembretesResponse] = await Promise.all([
        api.get(`/v1/veterinario/crm/retencao/inativos?dias=${dias}`),
        api.get('/v1/veterinario/crm/retencao/lembretes?concluidos=1'),
      ])
      setInativos(inativosResponse.data?.clientes || [])
      setLembretes(lembretesResponse.data?.lembretes || [])
    } catch (requestError: any) {
      if (ehFaltaDePlano(requestError)) setBloqueado(true)
      else setError(requestError.response?.data?.error || 'Não foi possível carregar a retenção.')
    } finally { setLoading(false) }
  }, [dias])
  useEffect(() => { carregar() }, [carregar])

  const alternarSelecao = (cliente: ApiPayload) => {
    setSelecionados((atuais) => {
      const proximos = new Map(atuais)
      if (proximos.has(cliente.tutor.id)) proximos.delete(cliente.tutor.id)
      else if (cliente.tutor.pets?.length) proximos.set(cliente.tutor.id, cliente.tutor.pets[0].id)
      return proximos
    })
  }

  const escolherPet = (tutorId: ApiPayload, petId: ApiPayload) => {
    setSelecionados((atuais) => new Map(atuais).set(tutorId, petId))
  }

  const convocar = async () => {
    setEnviando(true); setError('')
    try {
      const alvos = [...selecionados.entries()].map(([tutorId, petId]) => ({ tutor_id: tutorId, pet_id: petId }))
      const response = await api.post('/v1/veterinario/crm/retencao/convocar', {
        alvos,
        titulo: form.titulo,
        tipo: form.tipo,
        data_lembrete: form.data,
        mensagem: form.mensagem || undefined,
      })
      setResultado({ criados: response.data.criados, falhas: response.data.falhas })
      setCampanhaAberta(false)
      setForm({ ...FORM_VAZIO })
      setSelecionados(new Map())
      await carregar()
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível enviar a convocação.')
      setCampanhaAberta(false)
    } finally { setEnviando(false) }
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Retenção de clientes"
        subtitle="Quem já confiou em você e não voltou"
        onBack={() => navigate('/veterinario/clientes')}
      />
      <div className="vet-app-main">
        {loading && <VetLoading label="Carregando retenção" />}
        {!loading && bloqueado && (
          <CrmUpgrade
            titulo="Retenção é de plano pago"
            descricao="Veja quem sumiu, chame de volta com lembretes assinados por você e convoque campanhas de vacinação e check-up em lote."
          />
        )}
        {!loading && !bloqueado && (
          <>
            <div className="vet-tabs" role="tablist">
              <button className={`vet-tab ${aba === 'inativos' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={aba === 'inativos'} onClick={() => setAba('inativos')}>Sumiram ({inativos.length})</button>
              <button className={`vet-tab ${aba === 'lembretes' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={aba === 'lembretes'} onClick={() => setAba('lembretes')}>Lembretes enviados</button>
            </div>

            {error && <p className="vet-card vet-request" role="alert">{error}</p>}
            {resultado && (
              <p className="vet-card vet-bank-success" role="status">
                Convocação criada para {resultado.criados} {resultado.criados === 1 ? 'cliente' : 'clientes'}.
                {resultado.falhas.length > 0 && ` ${resultado.falhas.length} não ${resultado.falhas.length === 1 ? 'entrou' : 'entraram'}: ${resultado.falhas.map((falha: ApiPayload) => falha.motivo).join('; ')}`}
              </p>
            )}

            {aba === 'inativos' && (
              <>
                <div className="vet-crm-filters__row">
                  <span className="vet-crm-janela-label">Sem atendimento há</span>
                  <select className="input" value={dias} onChange={(event) => setDias(Number(event.target.value))} aria-label="Janela de inatividade">
                    {JANELAS.map(([valor, label]) => <option key={valor} value={valor}>{label} ou mais</option>)}
                  </select>
                </div>
                <section className="vet-list">
                  {inativos.length === 0 ? (
                    <div className="vet-card vet-empty">
                      <VetIcon name="check" size={38} />
                      <strong>Ninguém sumido nesta janela</strong>
                      <p>Todos os seus clientes tiveram atendimento nos últimos {dias} dias.</p>
                    </div>
                  ) : inativos.map((cliente) => {
                    const marcado = selecionados.has(cliente.tutor.id)
                    return (
                      <div className={`vet-card vet-crm-inativo ${marcado ? 'is-selected' : ''}`} key={cliente.tutor.id}>
                        <label className="vet-crm-inativo__check">
                          <input
                            type="checkbox"
                            checked={marcado}
                            disabled={!cliente.tutor.pets?.length}
                            onChange={() => alternarSelecao(cliente)}
                            aria-label={`Selecionar ${cliente.tutor.nome}`}
                          />
                          <VetAvatar user={cliente.tutor} size="sm" />
                          <span>
                            <strong>{cliente.apelido || cliente.tutor.nome}</strong>
                            <small>Há {cliente.dias_sem_atendimento} dias · {cliente.total_atendimentos} {cliente.total_atendimentos === 1 ? 'atendimento' : 'atendimentos'}</small>
                          </span>
                        </label>
                        {marcado && cliente.tutor.pets?.length > 1 && (
                          <select className="input" value={selecionados.get(cliente.tutor.id)} onChange={(event) => escolherPet(cliente.tutor.id, event.target.value)} aria-label="Pet que recebe o lembrete">
                            {cliente.tutor.pets.map((pet: ApiPayload) => <option key={pet.id} value={pet.id}>{pet.nome}</option>)}
                          </select>
                        )}
                      </div>
                    )
                  })}
                </section>
                {selecionados.size > 0 && (
                  <button className="vet-transfer-button" type="button" onClick={() => { setResultado(null); setCampanhaAberta(true) }}>
                    Convocar {selecionados.size} {selecionados.size === 1 ? 'cliente' : 'clientes'}
                  </button>
                )}
              </>
            )}

            {aba === 'lembretes' && (
              <section className="vet-list">
                {lembretes.length === 0 ? (
                  <div className="vet-card vet-empty">
                    <VetIcon name="bell" size={38} />
                    <strong>Nenhum lembrete criado por você</strong>
                    <p>Crie pela ficha do cliente ou convocando os que sumiram.</p>
                  </div>
                ) : lembretes.map((lembrete) => (
                  <article className="vet-card vet-crm-lembrete" key={lembrete.id}>
                    <span className="vet-history-mini__icon"><VetIcon name="bell" size={18} /></span>
                    <span>
                      <strong>{lembrete.titulo}</strong>
                      <small>{lembrete.pet?.nome} · {lembrete.pet?.tutor?.nome} · {formatDate(lembrete.data_lembrete)}</small>
                    </span>
                    <span className={`vet-status ${lembrete.concluido ? 'vet-status--confirmed' : lembrete.notificado ? 'vet-status--pending' : ''}`}>
                      {lembrete.concluido ? 'Concluído' : lembrete.notificado ? 'Avisado' : 'Agendado'}
                    </span>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {campanhaAberta && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="campanha-title">
            <div className="vet-modal__title">
              <VetIcon name="send" />
              <h2 id="campanha-title">Convocar {selecionados.size} {selecionados.size === 1 ? 'cliente' : 'clientes'}</h2>
              <button className="vet-icon-button" type="button" onClick={() => setCampanhaAberta(false)} aria-label="Fechar"><VetIcon name="close" size={18} /></button>
            </div>
            <div className="vet-prescription-note">
              <label>Título<input className="input" value={form.titulo} onChange={(event) => setForm({ ...form, titulo: event.target.value })} placeholder="Ex.: Check-up anual" /></label>
              <label>Tipo
                <select className="input" value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value })}>
                  {TIPOS_LEMBRETE.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                </select>
              </label>
              <label>Data do lembrete<input className="input" type="date" value={form.data} onChange={(event) => setForm({ ...form, data: event.target.value })} /></label>
              <label>Mensagem ao tutor (opcional)<textarea className="input" rows={3} value={form.mensagem} onChange={(event) => setForm({ ...form, mensagem: event.target.value })} placeholder="Sai no e-mail, assinada com o seu nome." /></label>
            </div>
            <button className="vet-modal__submit" type="button" disabled={enviando || !form.titulo || !form.data} onClick={convocar}>
              {enviando ? 'Convocando…' : 'Confirmar convocação'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
