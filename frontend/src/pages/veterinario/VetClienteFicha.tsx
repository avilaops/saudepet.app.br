import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import { VetAvatar, VetIcon, VetLoading, VetPageHeader, formatDate, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'
import { CrmUpgrade, RECURSOS, TIPOS_LEMBRETE, ehFaltaDePlano, statusAgendamentoLabel, useMeuPlano } from '../../components/veterinario/VetCrm'

export default function VetClienteFicha() {
  const navigate = useNavigate()
  const { tutorId } = useParams()
  const { tem, carregado } = useMeuPlano()
  const [ficha, setFicha] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [aviso, setAviso] = useState('')

  // Rascunho comercial: só vai ao backend no salvar, para o vet poder digitar
  // a nota inteira sem uma requisição por tecla.
  const [notas, setNotas] = useState('')
  const [apelido, setApelido] = useState('')
  const [tagsTexto, setTagsTexto] = useState('')
  const [salvando, setSalvando] = useState(false)

  const [lembreteAberto, setLembreteAberto] = useState(false)
  const [lembrete, setLembrete] = useState<ApiPayload>({ pet_id: '', titulo: '', tipo: 'retorno', data: '', mensagem: '' })
  const [enviandoLembrete, setEnviandoLembrete] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const response = await api.get(`/v1/veterinario/crm/clientes/${tutorId}`)
      setFicha(response.data)
      setNotas(response.data?.notas_privadas || '')
      setApelido(response.data?.apelido || '')
      setTagsTexto((response.data?.tags || []).join(', '))
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar a ficha deste cliente.')
    } finally { setLoading(false) }
  }, [tutorId])
  useEffect(() => { carregar() }, [carregar])

  const salvarFicha = async (dados: ApiPayload) => {
    setSalvando(true); setAviso('')
    try {
      const response = await api.put(`/v1/veterinario/crm/clientes/${tutorId}`, dados)
      setFicha((atual: ApiPayload) => ({ ...atual, ...response.data.cliente }))
      setAviso('Ficha atualizada.')
    } catch (requestError: any) {
      setAviso(ehFaltaDePlano(requestError)
        ? 'Notas, tags e favoritos são de plano pago — conheça os planos no Clube Vet.'
        : requestError.response?.data?.error || 'Não foi possível salvar.')
    } finally { setSalvando(false) }
  }

  const salvarAnotacoes = () => salvarFicha({
    notas_privadas: notas,
    apelido: apelido.trim() || null,
    tags: tagsTexto.split(',').map((tag) => tag.trim()).filter(Boolean),
  })

  const enviarLembrete = async () => {
    setEnviandoLembrete(true); setAviso('')
    try {
      await api.post('/v1/veterinario/crm/retencao/lembretes', {
        tutor_id: tutorId,
        pet_id: lembrete.pet_id,
        titulo: lembrete.titulo,
        tipo: lembrete.tipo,
        data_lembrete: lembrete.data,
        mensagem: lembrete.mensagem || undefined,
      })
      setLembreteAberto(false)
      setLembrete({ pet_id: '', titulo: '', tipo: 'retorno', data: '', mensagem: '' })
      setAviso('Lembrete criado — o tutor será avisado perto da data.')
    } catch (requestError: any) {
      setAviso(ehFaltaDePlano(requestError)
        ? 'Lembretes de retorno são de plano pago — conheça os planos no Clube Vet.'
        : requestError.response?.data?.error || 'Não foi possível criar o lembrete.')
    } finally { setEnviandoLembrete(false) }
  }

  if (loading) return <main className="vet-app"><VetLoading label="Carregando ficha" /></main>
  if (!ficha) {
    return (
      <main className="vet-app">
        <VetPageHeader compact title="Cliente" onBack={() => navigate('/veterinario/clientes')} />
        <div className="vet-app-main"><div className="vet-card vet-empty"><strong>{error || 'Cliente não encontrado.'}</strong></div></div>
      </main>
    )
  }

  const podeAnotar = !carregado || tem(RECURSOS.CLIENTES_NOTAS)

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title={ficha.apelido || ficha.tutor.nome}
        subtitle={ficha.apelido ? ficha.tutor.nome : ficha.tutor.cidade || undefined}
        onBack={() => navigate('/veterinario/clientes')}
        action={(
          <button
            className={`vet-icon-button ${ficha.favorito ? 'vet-crm-fav is-active' : 'vet-crm-fav'}`}
            type="button"
            onClick={() => salvarFicha({ favorito: !ficha.favorito })}
            disabled={salvando}
            aria-pressed={ficha.favorito}
            aria-label={ficha.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'}
          >
            <VetIcon name="star" size={18} />
          </button>
        )}
      />
      <div className="vet-app-main">
        {aviso && <p className="vet-card vet-bank-success" role="status">{aviso}</p>}

        <section className="vet-card vet-crm-resumo">
          <div className="vet-crm-resumo__head">
            <VetAvatar user={ficha.tutor} size="lg" />
            <div>
              <strong>{ficha.tutor.nome}</strong>
              <small>{ficha.tutor.email}</small>
              {ficha.tutor.telefone && <small>{ficha.tutor.telefone}</small>}
            </div>
          </div>
          <div className="vet-crm-resumo__grid">
            <div><strong>{ficha.resumo.total_atendimentos}</strong><small>Atendimentos</small></div>
            <div><strong>{ficha.resumo.ultimo_atendimento ? formatDate(ficha.resumo.ultimo_atendimento) : '—'}</strong><small>Último</small></div>
            <div><strong>{ficha.resumo.avaliacao_media ? `★ ${ficha.resumo.avaliacao_media}` : '—'}</strong><small>Avaliação</small></div>
            <div><strong>{formatDate(ficha.resumo.cliente_desde)}</strong><small>Cliente desde</small></div>
          </div>
          {ficha.tutor.pets?.length > 0 && (
            <div className="vet-crm-tags vet-crm-tags--inline">
              {ficha.tutor.pets.map((pet: ApiPayload) => (
                <span key={pet.id} className="vet-crm-tag is-static">{pet.nome}{pet.raca ? ` · ${pet.raca}` : ''}</span>
              ))}
            </div>
          )}
          <div className="vet-crm-resumo__actions">
            <button className="vet-button--primary" type="button" onClick={() => navigate('/veterinario/crm/agenda', { state: { tutor: ficha.tutor } })}>
              <VetIcon name="calendar" size={16} /> Agendar consulta
            </button>
            <button className="vet-button--secondary" type="button" onClick={() => setLembreteAberto(true)}>
              <VetIcon name="bell" size={16} /> Lembrete de retorno
            </button>
          </div>
        </section>

        {podeAnotar ? (
          <section className="vet-card vet-section-card">
            <div className="vet-section-card__title"><VetIcon name="tag" size={18} /><h2>Anotações privadas</h2></div>
            <div className="vet-prescription-note">
              <label>Apelido na sua lista<input className="input" value={apelido} onChange={(event) => setApelido(event.target.value)} placeholder="Ex.: Dona Maria do Thor" /></label>
              <label>Tags (separadas por vírgula)<input className="input" value={tagsTexto} onChange={(event) => setTagsTexto(event.target.value)} placeholder="Ex.: idoso, cardiopata, plano anual" /></label>
              <label>Notas — só você vê<textarea className="input" rows={4} value={notas} onChange={(event) => setNotas(event.target.value)} placeholder="Preferências, histórico de conversas, combinados…" /></label>
            </div>
            <button className="vet-button--primary" type="button" disabled={salvando} onClick={salvarAnotacoes}>{salvando ? 'Salvando…' : 'Salvar anotações'}</button>
          </section>
        ) : (
          <CrmUpgrade
            titulo="Anotações privadas, tags e favoritos"
            descricao="Guarde apelidos, combinados e classificações que só você enxerga — disponível nos planos pagos."
          />
        )}

        {ficha.proximos_agendamentos?.length > 0 && (
          <section className="vet-card vet-section-card">
            <div className="vet-section-card__title"><VetIcon name="calendar" size={18} /><h2>Próximas consultas</h2></div>
            {ficha.proximos_agendamentos.map((agendamento: ApiPayload) => (
              <div className="vet-history-mini" key={agendamento.id}>
                <span className="vet-history-mini__icon"><VetIcon name="clock" size={18} /></span>
                <span><strong>{formatDate(agendamento.inicio, true)}</strong><small>{agendamento.pet?.nome}</small></span>
                <span className={`vet-status ${agendamento.status === 'confirmado' ? 'vet-status--confirmed' : 'vet-status--pending'}`}>{statusAgendamentoLabel(agendamento.status)}</span>
              </div>
            ))}
          </section>
        )}

        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title"><VetIcon name="history" size={18} /><h2>Atendimentos com você</h2></div>
          {ficha.atendimentos.length === 0 ? <p className="vet-review-pending">Nenhum atendimento com este cliente ainda.</p> : ficha.atendimentos.map((atendimento: ApiPayload) => (
            <div className="vet-history-mini" key={atendimento.id}>
              <span className="vet-history-mini__icon"><VetIcon name="document" size={18} /></span>
              <span>
                <strong>{atendimento.pet?.nome || 'Pet'} · {serviceLabel(atendimento.tipo_atendimento)}</strong>
                <small>{formatDate(atendimento.finalizado_em || atendimento.criado_em)}{atendimento.diagnostico ? ` · ${atendimento.diagnostico}` : ''}</small>
              </span>
              <span className="vet-history-mini__rating">
                {atendimento.avaliacao ? `★ ${atendimento.avaliacao.nota}/5` : atendimento.valor_estimado ? formatMoney(atendimento.valor_estimado) : ''}
              </span>
            </div>
          ))}
        </section>
      </div>

      {lembreteAberto && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="lembrete-title">
            <div className="vet-modal__title">
              <VetIcon name="bell" />
              <h2 id="lembrete-title">Lembrete de retorno</h2>
              <button className="vet-icon-button" type="button" onClick={() => setLembreteAberto(false)} aria-label="Fechar"><VetIcon name="close" size={18} /></button>
            </div>
            <div className="vet-prescription-note">
              <label>Pet
                <select className="input" value={lembrete.pet_id} onChange={(event) => setLembrete({ ...lembrete, pet_id: event.target.value })}>
                  <option value="">Escolha o pet</option>
                  {ficha.tutor.pets?.map((pet: ApiPayload) => <option key={pet.id} value={pet.id}>{pet.nome}</option>)}
                </select>
              </label>
              <label>Tipo
                <select className="input" value={lembrete.tipo} onChange={(event) => setLembrete({ ...lembrete, tipo: event.target.value })}>
                  {TIPOS_LEMBRETE.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
                </select>
              </label>
              <label>Título<input className="input" value={lembrete.titulo} onChange={(event) => setLembrete({ ...lembrete, titulo: event.target.value })} placeholder="Ex.: Retorno pós-cirúrgico" /></label>
              <label>Data<input className="input" type="date" value={lembrete.data} onChange={(event) => setLembrete({ ...lembrete, data: event.target.value })} /></label>
              <label>Mensagem ao tutor (opcional)<textarea className="input" rows={3} value={lembrete.mensagem} onChange={(event) => setLembrete({ ...lembrete, mensagem: event.target.value })} /></label>
            </div>
            <button
              className="vet-modal__submit"
              type="button"
              disabled={enviandoLembrete || !lembrete.pet_id || !lembrete.titulo || !lembrete.data}
              onClick={enviarLembrete}
            >
              {enviandoLembrete ? 'Criando…' : 'Criar lembrete'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
