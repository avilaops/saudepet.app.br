import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon, VetLoading, VetPageHeader, formatDate, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'
import AvaliarTutor from '../../components/veterinario/AvaliarTutor'

export default function VetHistorico() {
  const navigate = useNavigate()
  const [appointments, setAppointments] = useState<ApiPayload[]>([])
  const [veterinarian, setVeterinarian] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [prescription, setPrescription] = useState<ApiPayload | null>(null)
  const [text, setText] = useState('')
  // Corrigir receita de atendimento fechado reemite o documento do tutor —
  // por isso o motivo é obrigatório e sai impresso no PDF novo.
  const [motivo, setMotivo] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [historyResponse, vetResponse] = await Promise.all([api.get('/solicitacoes/veterinario/por-status?status=finalizados'), api.get('/veterinarios/meus-dados')])
      setAppointments(Array.isArray(historyResponse.data) ? historyResponse.data : [])
      setVeterinarian(vetResponse.data)
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar o histórico.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const openPrescription = (item: ApiPayload) => {
    setPrescription(item)
    setText(item.receita || '')
    setMotivo('')
  }

  const savePrescription = async () => {
    if (!prescription || !text.trim() || motivo.trim().length < 10) return
    setSaving(true)
    setError('')
    try {
      const response = await api.put(`/solicitacoes/${prescription.id}/prescricao`, {
        receita: text.trim(),
        motivo: motivo.trim()
      })
      setAppointments((items) => items.map((item) => item.id === prescription.id
        ? { ...item, receita: response.data.receita, receita_pdf_url: response.data.receita_pdf_url, receita_versao: response.data.receita_versao }
        : item))
      setPrescription(null)
    } catch (requestError: any) {
      const dados = requestError.response?.data
      setError(dados?.details?.map((item: ApiPayload) => item.message).join(' • ') || dados?.error || 'Não foi possível salvar a prescrição.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="vet-app">
      <VetPageHeader compact title="Histórico de atendimentos" onBack={() => navigate('/veterinario/home')} />
      <div className="vet-app-main">
        {loading ? <VetLoading label="Carregando histórico" /> : error && appointments.length === 0 ? (
          <div className="vet-card vet-empty" role="alert">
            <strong>{error}</strong>
            <button className="vet-button--primary" onClick={load}>Tentar novamente</button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="vet-card vet-empty">
            <VetIcon name="history" size={40} />
            <strong>Nenhum atendimento finalizado</strong>
            <p>Os atendimentos concluídos aparecerão aqui.</p>
          </div>
        ) : (
          <section className="vet-history-list" aria-label="Atendimentos finalizados">
            {error && <p role="alert" className="vet-card vet-request">{error}</p>}

            {appointments.map((item) => (
              <article className="vet-card vet-history-card" key={item.id}>
                <div className="vet-history-card__head">
                  <span className="vet-service-icon"><VetIcon name="document" size={19} /></span>
                  <div>
                    <h2>{item.pet?.nome || 'Pet'} · {item.tutor?.nome || 'Tutor'}</h2>
                    <p className="vet-history-card__meta">
                      {serviceLabel(item.tipo_atendimento)} · {formatDate(item.finalizado_em || item.criado_em)}
                    </p>
                  </div>
                  <strong className="vet-history-card__price">
                    {item.valor_estimado ? formatMoney(item.valor_estimado) : '—'}
                  </strong>
                </div>

                <button
                  className="vet-prescription-button"
                  type="button"
                  onClick={() => navigate(`/veterinario/atendimento/${item.id}/prontuario`)}
                >
                  <VetIcon name="folder" size={17} />Ver prontuário do atendimento
                </button>

                <button className="vet-prescription-button" type="button" onClick={() => openPrescription(item)}>
                  <VetIcon name="document" size={17} />
                  {item.receita ? 'Ver ou atualizar prescrição' : 'Registrar prescrição médica'}
                </button>

                {!item.avaliacao ? (
                  <p className="vet-review-pending">Tutor ainda não avaliou</p>
                ) : (
                  <div className="vet-review">
                    <strong><VetIcon name="check" size={14} /> Avaliação recebida</strong>
                    <span
                      className="vet-review__stars"
                      role="img"
                      aria-label={`${item.avaliacao.nota} de 5 estrelas`}
                    >
                      {[1, 2, 3, 4, 5].map((posicao) => (
                        <VetIcon
                          key={posicao}
                          name="star"
                          size={13}
                          className={posicao <= item.avaliacao.nota ? 'is-filled' : ''}
                        />
                      ))}
                    </span> &nbsp; {item.avaliacao.nota}/5
                    {item.avaliacao.comentario && <em>“{item.avaliacao.comentario}”</em>}
                  </div>
                )}

                {/* O outro lado: até agora só o tutor avaliava. */}
                <AvaliarTutor
                  atendimentoId={item.id}
                  avaliacaoExistente={item.avaliacao_do_veterinario}
                />
              </article>
            ))}
          </section>
        )}
      </div>
      {prescription && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setPrescription(null)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="prescription-title">
            <div className="vet-modal__title">
              <VetIcon name="document" />
              <h2 id="prescription-title">Prescrição médica</h2>
              <button className="vet-icon-button" type="button" onClick={() => setPrescription(null)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-modal__patient">
              <strong>{prescription.pet?.nome || 'Pet'} · {prescription.tutor?.nome || 'Tutor'}</strong>
              <small>{formatDate(prescription.finalizado_em || prescription.criado_em)}</small>
            </div>

            <div className="vet-signature">
              <VetIcon name="shield" />
              <div>
                <strong>Identificação profissional</strong>
                <small>Dr(a). {veterinarian?.usuario?.nome || 'Veterinário'} · CRMV {veterinarian?.crmv || 'não informado'}</small>
              </div>
            </div>

            {/* Retificar depois do fechamento reemite o documento: o motivo é
                obrigatório, sai impresso na via nova e o tutor é avisado. */}
            <div className="vet-policy">
              <strong>Isto reemite o documento</strong>
              O tutor já recebeu a receita atual. Corrigir gera uma nova versão marcada como retificação, com o motivo impresso, e avisa o tutor de que a via anterior não vale mais.
            </div>

            <div className="vet-prescription-note">
              <label htmlFor="prescription-text">Orientações e prescrição</label>
              <textarea
                id="prescription-text"
                maxLength={5000}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Registre a prescrição de forma clara e objetiva."
              />

              <label htmlFor="prescription-motivo">Motivo da retificação</label>
              <textarea
                id="prescription-motivo"
                rows={2}
                maxLength={500}
                value={motivo}
                onChange={(event) => setMotivo(event.target.value)}
                placeholder="Ex.: dose informada em miligramas quando o correto é mililitros."
              />

              <small className="vet-review-pending">
                {motivo.trim().length < 10
                  ? `Faltam ${10 - motivo.trim().length} caractere(s) para justificar a correção.`
                  : 'Este texto sai impresso na receita nova.'}
              </small>
            </div>

            <button
              className="vet-modal__submit"
              type="button"
              disabled={saving || !text.trim() || motivo.trim().length < 10}
              onClick={savePrescription}
            >
              {saving ? 'Reemitindo…' : 'Retificar e reemitir receita'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
