import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon, VetLoading, VetPageHeader, serviceLabel } from '../../components/veterinario/VetUI'
import { useSocket } from '../../contexts/SocketContext'
import ReportarViolacaoModal from '../../components/ReportarViolacaoModal'
import MapaDoDestino from '../../components/veterinario/MapaDoDestino'
import MidiasDoAtendimento from '../../components/MidiasDoAtendimento'
import Videochamada from '../../components/Videochamada'

// O tipo de atendimento tinha um emoji por ramo direto no JSX. O rótulo é o
// mesmo; o desenho passa a ser o mesmo traço das outras telas do vet.
const ICONE_ATENDIMENTO: Record<string, string> = {
  emergencia: 'bell',
  consulta_domiciliar: 'home',
  teleorientacao: 'message'
}

export default function VetAtendimentoAtivo() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [atendimento, setAtendimento] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const { socket, emitAtualizacaoStatus } = useSocket()
  const [emergencia, setEmergencia] = useState<ApiPayload | null>(null) // { motivo, orientacao }
  const [encaminhando, setEncaminhando] = useState(false)
  const [erro, setErro] = useState('')
  const [formularios, setFormularios] = useState<ApiPayload[]>([]) // respostas do atendimento
  const [verFormularios, setVerFormularios] = useState(false)
  const [denunciar, setDenunciar] = useState(false)
  const [desistencia, setDesistencia] = useState<ApiPayload | null>(null) // { motivo }
  const [desistindo, setDesistindo] = useState(false)

  useEffect(() => {
    api.get(`/formularios/respostas/atendimento/${id}`)
      .then((r) => setFormularios(r.data.respostas || []))
      .catch(() => {})
  }, [id])

  useEffect(() => {
    carregarAtendimento()
  }, [id])

  // Posição ao vivo enquanto o veterinário está a caminho.
  //
  // `PUT /solicitacoes/:id/location` existe desde sempre, grava a coordenada e
  // emite `vet:location_update` na sala do atendimento — e NENHUMA tela o
  // chamava. O mapa "veterinário a caminho" do tutor nunca recebia um ponto:
  // ficava parado, prometendo um acompanhamento que não existia.
  useEffect(() => {
    if (atendimento?.status !== 'a_caminho') return undefined
    if (!navigator.geolocation) return undefined

    // O GPS do celular dispara muitas vezes por minuto. Mandar tudo gastaria
    // bateria e API sem melhorar nada para quem olha o mapa.
    let ultimoEnvio = 0
    const INTERVALO_MINIMO = 15000

    const observador = navigator.geolocation.watchPosition(
      ({ coords }) => {
        const agora = Date.now()
        if (agora - ultimoEnvio < INTERVALO_MINIMO) return
        ultimoEnvio = agora
        api.put(`/solicitacoes/${id}/location`, {
          latitude: coords.latitude,
          longitude: coords.longitude
        }).catch(() => {
          // Falha de rede no meio do trânsito é esperada: a próxima leitura
          // tenta de novo. Não vale interromper o vet com um erro na tela.
        })
      },
      () => {
        // Permissão negada: o tutor continua vendo o status, só não o mapa.
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 }
    )

    return () => navigator.geolocation.clearWatch(observador)
  }, [atendimento?.status, id])

  useEffect(() => {
    if (socket) {
      socket.emit('atendimento:join', { solicitacaoId: id })
    }
  }, [socket, id])

  const carregarAtendimento = async () => {
    try {
      // Busca direta pelo id — antes baixava a lista inteira e fazia .find()
      // no cliente, e qualquer falha virava tela em branco sem explicação.
      const { data } = await api.get(`/solicitacoes/${id}`)
      const item = data?.solicitacao || data
      if (item?.id) {
        setAtendimento(item)
      } else {
        setErro('Atendimento não encontrado.')
      }
    } catch (error: any) {
      setErro(error.response?.status === 404
        ? 'Atendimento não encontrado — ele pode ter sido cancelado.'
        : error.response?.data?.error || 'Não foi possível carregar o atendimento.')
    } finally {
      setLoading(false)
    }
  }

  const atualizarStatus = async (novoStatus: ApiPayload) => {
    setErro('')
    try {
      await api.put(`/solicitacoes/${id}/status`, { status: novoStatus })

      emitAtualizacaoStatus({
        solicitacaoId: id,
        tutorId: atendimento.tutor_id,
        veterinarioId: atendimento.veterinario_id,
        status: novoStatus
      })

      carregarAtendimento()
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível atualizar o status.')
    }
  }

  const desistir = async () => {
    setDesistindo(true)
    setErro('')
    try {
      await api.put(`/solicitacoes/${id}/desistir`, { motivo: desistencia.motivo.trim() })
      setDesistencia(null)
      navigate('/veterinario/home', { state: { aviso: 'Você saiu do atendimento e o tutor foi avisado.' } })
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível sair do atendimento.')
    } finally {
      setDesistindo(false)
    }
  }

  const encaminharEmergencia = async () => {
    setEncaminhando(true)
    setErro('')
    try {
      await api.put(`/solicitacoes/${id}/encaminhar-emergencia`, {
        motivo: emergencia.motivo.trim(),
        orientacao: emergencia.orientacao.trim() || undefined
      })
      setEmergencia(null)
      navigate('/veterinario')
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível registrar o encaminhamento.')
    } finally {
      setEncaminhando(false)
    }
  }

  if (loading) {
    return (
      <main className="vet-app">
        <VetLoading />
      </main>
    )
  }

  if (!atendimento) {
    return (
      <main className="vet-app">
        <VetPageHeader title="Atendimento" onBack={() => navigate('/veterinario')} />
        <div className="vet-app-main">
          <div className="vet-card vet-empty">
            <strong>{erro || 'Atendimento não encontrado.'}</strong>
            <button
              className="vet-button--primary"
              type="button"
              onClick={() => { setLoading(true); setErro(''); carregarAtendimento() }}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </main>
    )
  }

  // A tela servia só o atendimento vivo, mas é a mesma que o histórico e a
  // agenda abrem: um atendimento já finalizado aparecia como "em andamento",
  // com o mapa de como chegar e sem nenhum caminho para o prontuário.
  const EM_CURSO = ['aceito', 'veterinario_encontrado', 'a_caminho', 'chegou', 'atendimento_em_andamento']
  const emCurso = EM_CURSO.includes(atendimento.status)
  const TITULOS: Record<string, string> = {
    aceito: 'Atendimento aceito',
    veterinario_encontrado: 'Atendimento aceito',
    a_caminho: 'A caminho do atendimento',
    chegou: 'Você chegou',
    atendimento_em_andamento: 'Atendimento em andamento',
    finalizado: 'Atendimento finalizado'
  }

  return (
    <main className="vet-app">
      <VetPageHeader
        title={TITULOS[atendimento.status] || (emCurso ? 'Atendimento' : 'Atendimento encerrado')}
        subtitle={atendimento.pet?.nome}
        onBack={() => navigate('/veterinario')}
      />

      <div className="vet-record">
        {erro && <p className="vet-card vet-request" role="alert">{erro}</p>}

        {/* Informações do Pet */}
        <section className="vet-card vet-record-patient">
          <span className="vet-service-icon"><VetIcon name="document" size={19} /></span>
          <div>
            <strong>{atendimento.pet?.nome}</strong>
            <small>{atendimento.pet?.raca || atendimento.pet?.tipo}</small>
            {atendimento.pet?.idade && (
              <small>{atendimento.pet.idade} anos • {atendimento.pet.peso} kg</small>
            )}
          </div>
        </section>

        {/* O endereço não aparecia em lugar nenhum desta tela: o veterinário
            aceitava o chamado e ficava sem saber onde era, tendo que voltar
            para a lista ou perguntar no chat. */}
        {emCurso ? (
          <MapaDoDestino
            destino={{ latitude: atendimento.latitude, longitude: atendimento.longitude }}
            endereco={atendimento.localizacao_cliente}
          />
        ) : (
          <section className="vet-card vet-empty">
            <strong>{atendimento.status === 'finalizado' ? 'Este atendimento já foi finalizado.' : 'Este atendimento foi encerrado.'}</strong>
            {atendimento.status === 'finalizado' && (
              <button className="vet-button--primary" type="button" onClick={() => navigate(`/veterinario/atendimento/${atendimento.id}/prontuario`)}>
                Ver o prontuário
              </button>
            )}
          </section>
        )}

        {emCurso && <Videochamada atendimentoId={id || ''} papel="veterinario" />}

        {/* O que o tutor mandou ao pedir socorro e o que o profissional
            registra na consulta, no mesmo lugar. Entra no prontuário — antes a
            única foto possível ia para o chat e sumia em 90 dias. */}
        <MidiasDoAtendimento
          atendimentoId={id || ''}
          podeEditar
          titulo="Fotos, vídeos e áudios do caso"
          ajuda="Nada anexado ainda. Registre o que a descrição não mostra — lesão, secreção, postura — e escreva o que o arquivo mostra."
        />

        {/* Alergias e prescrições anteriores mudam a conduta: precisam estar
            acessíveis durante o atendimento, não só no fechamento. */}
        <div>
          <button
            type="button"
            className="vet-prescription-button"
            onClick={() => navigate(`/veterinario/atendimento/${id}/historico-do-pet`)}
          >
            <VetIcon name="folder" size={17} />Histórico clínico do pet
          </button>

          {formularios.length > 0 && (
            <button
              type="button"
              className="vet-prescription-button"
              onClick={() => setVerFormularios(true)}
            >
              <VetIcon name="document" size={17} />Anamnese e formulários respondidos ({formularios.length})
            </button>
          )}
        </div>

        {/* Informações do Tutor */}
        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title">
            <VetIcon name="user" size={18} />
            <h2>Tutor</h2>
          </div>
          <p className="vet-live__tutor">{atendimento.tutor?.nome}</p>
          <a className="vet-live__link" href={`tel:${atendimento.tutor?.telefone}`}>
            <VetIcon name="support" size={17} />Ligar para Tutor
          </a>
          <button type="button" className="vet-live__report" onClick={() => setDenunciar(true)}>
            Denunciar conduta deste tutor
          </button>
        </section>

        {denunciar && (
          <ReportarViolacaoModal
            usuarioId={atendimento.tutor_id}
            nomeAlvo={atendimento.tutor?.nome}
            onClose={() => setDenunciar(false)}
          />
        )}

        {/* Tipo de Atendimento */}
        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title">
            <VetIcon name={ICONE_ATENDIMENTO[atendimento.tipo_atendimento] || 'info'} size={18} />
            <h2>Tipo de Atendimento</h2>
          </div>
          <p className="vet-live__type">
            {atendimento.tipo_atendimento === 'emergencia' && 'Emergência'}
            {atendimento.tipo_atendimento === 'consulta_domiciliar' && 'Consulta Domiciliar'}
            {atendimento.tipo_atendimento === 'teleorientacao' && 'Teleorientação'}
          </p>
        </section>

        {/* Botões de Ação */}
        <div className="vet-live__actions">
          {atendimento.status === 'veterinario_encontrado' && (
            <button className="vet-button--primary" type="button" onClick={() => atualizarStatus('a_caminho')}>
              <VetIcon name="send" size={17} />Estou a caminho
            </button>
          )}

          {atendimento.status === 'a_caminho' && (
            <button className="vet-button--primary" type="button" onClick={() => atualizarStatus('chegou')}>
              <VetIcon name="pin" size={17} />Cheguei
            </button>
          )}

          {atendimento.status === 'chegou' && (
            <button
              className="vet-button--primary"
              type="button"
              onClick={() => atualizarStatus('atendimento_em_andamento')}
            >
              <VetIcon name="power" size={17} />Iniciar Atendimento
            </button>
          )}

          {/* Finalizar é preencher o prontuário: o encerramento emite receita e
              prontuário em PDF para o tutor, e não acontece sem registro clínico. */}
          {atendimento.status === 'atendimento_em_andamento' && (
            <button
              className="vet-live__finish"
              type="button"
              onClick={() => navigate(`/veterinario/atendimento/${id}/prontuario`)}
            >
              <VetIcon name="check" size={17} />Finalizar e emitir prontuário
            </button>
          )}

          {/* Emergência clínica: o caso excede o atendimento domiciliar. O
              desfecho fica registrado como "encaminhado" — nem finalização
              normal, nem cancelamento — e o tutor é avisado na hora. */}
          {['aceito', 'a_caminho', 'chegou', 'atendimento_em_andamento'].includes(atendimento.status) && (
            <button
              className="vet-live__emergency"
              type="button"
              onClick={() => setEmergencia({ motivo: '', orientacao: '' })}
            >
              <VetIcon name="bell" size={17} />Encaminhar para emergência
            </button>
          )}

          {/* Desistir depois de aceitar. `cancelado_vet` existia na máquina de
              estados e nenhuma tela o alcançava: quem aceitasse e não pudesse
              ir deixava o chamado preso e o tutor esperando. */}
          {['aceito', 'veterinario_encontrado', 'a_caminho', 'chegou'].includes(atendimento.status) && (
            <button
              className="vet-button--ghost"
              type="button"
              onClick={() => setDesistencia({ motivo: '' })}
            >
              <VetIcon name="close" size={17} />Não vou conseguir atender
            </button>
          )}
        </div>
      </div>

      {desistencia && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setDesistencia(null)}
        >
          <div className="vet-modal" role="dialog" aria-modal="true" aria-label="Sair do atendimento">
            <h2>Não vou conseguir atender</h2>
            <p className="vet-review-pending">
              O atendimento é encerrado e o tutor recebe o aviso na hora, com o seu motivo, para poder chamar
              outro profissional. Se o caso exige pronto-socorro, use "Encaminhar para emergência".
            </p>
            <label>
              Motivo
              <textarea
                className="input"
                rows={3}
                value={desistencia.motivo}
                onChange={(event) => setDesistencia({ motivo: event.target.value })}
                maxLength={300}
                placeholder="Ex.: tive um imprevisto e não consigo chegar hoje"
              />
            </label>
            <button
              className="vet-modal__submit vet-modal__submit--danger"
              type="button"
              disabled={desistindo || desistencia.motivo.trim().length < 5}
              onClick={desistir}
            >
              {desistindo ? 'Saindo…' : 'Sair do atendimento'}
            </button>
            <button className="vet-button--ghost" type="button" onClick={() => setDesistencia(null)}>
              Voltar
            </button>
          </div>
        </div>
      )}

      {verFormularios && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setVerFormularios(false)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="formularios-titulo">
            <div className="vet-modal__title">
              <VetIcon name="document" />
              <h2 id="formularios-titulo">Formulários respondidos</h2>
              <button className="vet-icon-button" type="button" onClick={() => setVerFormularios(false)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            {formularios.map((resposta) => {
              const rotulos = Object.fromEntries((resposta.formulario.campos || []).map((c: ApiPayload) => [c.id, c.label]))
              return (
                <div key={resposta.id} className="vet-forms-answer">
                  <p>{resposta.formulario.titulo}</p>
                  <span className="vet-forms-answer__date">{new Date(resposta.criado_em).toLocaleString('pt-BR')}</span>
                  <dl>
                    {Object.entries(resposta.respostas || {}).map(([campoId, valor]) => (
                      <div key={campoId}>
                        <dt>{rotulos[campoId] || campoId}</dt>
                        <dd>{Array.isArray(valor) ? valor.join(', ') : String(valor)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )
            })}
          </section>
        </div>
      )}

      {emergencia && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setEmergencia(null)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="emergencia-titulo">
            <div className="vet-modal__title">
              <VetIcon name="bell" />
              <h2 id="emergencia-titulo">Encaminhar para emergência</h2>
              <button className="vet-icon-button" type="button" onClick={() => setEmergencia(null)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-modal__patient">
              <strong>{atendimento.pet?.nome || 'Pet'} · {atendimento.tutor?.nome || 'Tutor'}</strong>
              <small>{serviceLabel(atendimento.tipo_atendimento)}</small>
            </div>

            <div className="vet-policy vet-policy--alerta">
              O atendimento será encerrado como <strong>encaminhado</strong> e o tutor recebe a orientação
              imediatamente, por notificação e no app.
            </div>

            <div className="vet-prescription-note">
              <label htmlFor="emergencia-motivo">Motivo clínico (obrigatório)</label>
              <textarea
                id="emergencia-motivo"
                rows={3}
                value={emergencia.motivo}
                onChange={(e) => setEmergencia({ ...emergencia, motivo: e.target.value })}
                placeholder="Ex.: suspeita de torção gástrica; requer cirurgia imediata"
              />

              <label htmlFor="emergencia-orientacao">Orientação ao tutor (opcional)</label>
              <textarea
                id="emergencia-orientacao"
                rows={2}
                value={emergencia.orientacao}
                onChange={(e) => setEmergencia({ ...emergencia, orientacao: e.target.value })}
                placeholder="Ex.: levar imediatamente ao Hospital Veterinário X, manter o animal em jejum"
              />
            </div>

            <button
              className="vet-modal__submit vet-modal__submit--danger"
              type="button"
              onClick={encaminharEmergencia}
              disabled={emergencia.motivo.trim().length < 10 || encaminhando}
            >
              {encaminhando ? 'Registrando…' : 'Confirmar encaminhamento'}
            </button>
          </section>
        </div>
      )}
    </main>
  )
}
