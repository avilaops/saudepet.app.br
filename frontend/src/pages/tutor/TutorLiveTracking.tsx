import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import api from '../../services/api'
import BuscaEncerrada from '../../components/tutor/BuscaEncerrada'
import Videochamada from '../../components/Videochamada'
import { useSocket } from '../../contexts/SocketContext'
import FormulariosPendentes from '../../components/tutor/FormulariosPendentes'
import ReportarViolacaoModal from '../../components/ReportarViolacaoModal'
import { Badge, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import MapaDoAtendimento from '../../components/tutor/MapaDoAtendimento'

// Etapas da jornada, na ordem em que o tutor as vive. `encaminhado` e
// `cancelado` são desfechos fora da linha e têm cartão próprio.
const ETAPAS = [
  { chave: 'procurando', status: ['procurando_veterinario', 'oferta_enviada'], icone: 'spark', titulo: 'Procurando veterinário', texto: 'Sua solicitação está visível para os profissionais de plantão.' },
  { chave: 'confirmado', status: ['veterinario_encontrado', 'aceito'], icone: 'vet', titulo: 'Veterinário confirmado', texto: 'Um profissional aceitou o chamado e está se preparando.' },
  { chave: 'a_caminho', status: ['a_caminho'], icone: 'route', titulo: 'A caminho', texto: 'O veterinário está se deslocando até você.' },
  { chave: 'chegou', status: ['chegou'], icone: 'check', titulo: 'Chegou ao local', texto: 'O profissional está aí — receba-o com o pet por perto.' },
  { chave: 'em_atendimento', status: ['atendimento_em_andamento'], icone: 'clipboard', titulo: 'Em atendimento', texto: 'Consulta em andamento. O prontuário é registrado ao final.' },
  { chave: 'finalizado', status: ['finalizado', 'concluido'], icone: 'star', titulo: 'Finalizado', texto: 'Atendimento concluído — documentos disponíveis abaixo.' },
]

const CANCELAVEIS = ['procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado', 'aceito', 'a_caminho']

function etapaAtualIndex(status: string) {
  const indice = ETAPAS.findIndex((etapa) => etapa.status.includes(status))
  return indice === -1 ? 0 : indice
}

export default function TutorLiveTracking() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { socket } = useSocket()

  const [solicitacao, setSolicitacao] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [vetLocation, setVetLocation] = useState<ApiPayload | null>(null)
  const [denunciar, setDenunciar] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const { data } = await api.get(`/solicitacoes/${id}`)
      const item = data?.solicitacao || data
      if (!item?.id) throw new Error('Resposta inesperada')
      setSolicitacao(item)
      if (item.latitude_vet && item.longitude_vet) {
        setVetLocation({ latitude: item.latitude_vet, longitude: item.longitude_vet })
      }
    } catch (requestError: any) {
      setErro(requestError.response?.status === 404
        ? 'Atendimento não encontrado — ele pode ter sido cancelado.'
        : requestError.response?.data?.error || 'Não foi possível carregar o atendimento.')
    } finally {
      setLoading(false)
    }
  }, [id])
  useEffect(() => { carregar() }, [carregar])

  useEffect(() => {
    if (!socket || !id) return undefined
    socket.emit('join:room', `atendimento:${id}`)
    socket.emit('atendimento:join', { solicitacaoId: id })

    const aoMudarStatus = (data: ApiPayload) => {
      if (data.solicitacaoId === id) setSolicitacao((prev: ApiPayload) => (prev ? { ...prev, status: data.status } : prev))
    }
    const aoAtualizar = (data: ApiPayload) => { if (data.solicitacaoId === id) carregar() }
    const aoCancelar = (data: ApiPayload) => {
      if (data.solicitacaoId === id) navigate('/tutor', { state: { aviso: 'O atendimento foi cancelado.' } })
    }
    const aoMoverVet = (data: ApiPayload) => {
      if (data.solicitacaoId === id) setVetLocation({ latitude: data.latitude, longitude: data.longitude })
    }
    socket.on('atendimento:status', aoMudarStatus)
    socket.on('solicitacao:status_changed', aoMudarStatus)
    socket.on('atendimento:atualizado', aoAtualizar)
    socket.on('atendimento:cancelado', aoCancelar)
    socket.on('vet:location_update', aoMoverVet)
    return () => {
      socket.off('atendimento:status', aoMudarStatus)
      socket.off('solicitacao:status_changed', aoMudarStatus)
      socket.off('atendimento:atualizado', aoAtualizar)
      socket.off('atendimento:cancelado', aoCancelar)
      socket.off('vet:location_update', aoMoverVet)
    }
  }, [socket, id, navigate, carregar])

  const cancelar = async () => {
    setErroAcao('')

    // Pergunta ao servidor o que acontece com o dinheiro ANTES de confirmar:
    // ninguém deve descobrir a taxa de deslocamento depois de cancelar.
    let politica = null
    try {
      const { data } = await api.get(`/v1/solicitacoes/${id}/cancelamento`)
      politica = data.politica
    } catch {
      // Sem a prévia, o cancelamento continua possível — a regra vale no
      // servidor de qualquer forma. O que se perde é o aviso.
    }

    const pergunta = politica
      ? `${politica.texto}

Confirma o cancelamento?`
      : 'Tem certeza que deseja cancelar este atendimento?'

    if (!window.confirm(pergunta)) return

    setCancelando(true)
    try {
      const { data } = await api.put(`/solicitacoes/${id}/cancelar`)
      const estornado = data?.reembolso?.valor_estornado
      const aviso = estornado > 0
        ? `Atendimento cancelado. Estorno de ${Number(estornado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} a caminho.`
        : 'Atendimento cancelado.'
      navigate('/tutor', { state: { aviso } })
    } catch (requestError: any) {
      setErroAcao(requestError.response?.data?.error || 'Não foi possível cancelar o atendimento.')
    } finally {
      setCancelando(false)
    }
  }

  if (loading) {
    return (
      <div className="container-app flex min-h-screen items-center justify-center bg-surface-page">
        <span className="h-10 w-10 animate-spin rounded-full border-4 border-primary/30 border-t-primary" aria-label="Carregando" />
      </div>
    )
  }

  if (erro || !solicitacao) {
    return (
      <div className="container-app bg-surface-page pb-24">
        <PageHeader title="Acompanhar atendimento" onBack={() => navigate('/tutor')} />
        <div className="px-5 py-6">
          <Panel className="px-6 py-8 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-red-50 text-red-500"><Icon name="alert" size={20} /></span>
            <p className="mt-3 text-[0.85rem] font-semibold text-ink">{erro || 'Atendimento não encontrado.'}</p>
            <button type="button" onClick={carregar} className="mt-4 rounded-xl bg-primary px-5 py-2.5 text-[0.78rem] font-semibold text-white">Tentar novamente</button>
          </Panel>
        </div>
      </div>
    )
  }

  const indiceAtual = etapaAtualIndex(solicitacao.status)
  const finalizado = ['finalizado', 'concluido'].includes(solicitacao.status)
  const encaminhado = solicitacao.status === 'encaminhado'
  // A busca acabou sem ninguém: a tela deixa de fingir que ainda procura.
  const buscaEncerrada = solicitacao.status === 'sem_veterinario'
  const podeCancelar = CANCELAVEIS.includes(solicitacao.status)
  const vet = solicitacao.veterinario
  const vetUsuario = vet?.usuario

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader title="Acompanhar atendimento" subtitle={solicitacao.pet?.nome} onBack={() => navigate('/tutor')} />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erroAcao && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">{erroAcao}</p>
        )}

        {/* Desfecho de emergência clínica */}
        {encaminhado && (
          <Panel className="border-red-200 bg-red-50 px-4 py-4">
            <div className="flex gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600"><Icon name="alert" size={18} /></span>
              <div>
                <p className="text-[0.85rem] font-semibold text-red-800">Procure um serviço de emergência</p>
                <p className="mt-1 text-[0.75rem] leading-relaxed text-red-700">
                  O veterinário avaliou que o caso precisa de estrutura de emergência.
                </p>
                {/* Até agora esta tela lia `orientacao_encaminhamento`, um campo
                    que nunca existiu: a orientação escrita pelo profissional
                    não chegava, e o tutor era mandado para o chat no pior
                    momento possível. */}
                {solicitacao.encaminhamento_motivo && (
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-red-800">
                    <strong>Motivo:</strong> {solicitacao.encaminhamento_motivo}
                  </p>
                )}
                {solicitacao.encaminhamento_orientacao ? (
                  <p className="mt-1.5 rounded-xl bg-white/70 px-3 py-2 text-[0.75rem] leading-relaxed text-red-900">
                    <strong>O que fazer agora:</strong> {solicitacao.encaminhamento_orientacao}
                  </p>
                ) : (
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-red-700">
                    Veja as orientações no chat ou ligue para o profissional.
                  </p>
                )}
              </div>
            </div>
          </Panel>
        )}

        {/* Teleorientação: o produto vendia "vídeo chamada instantânea" e não
            tinha vídeo. O componente só aparece quando o atendimento é
            teleorientação e está de pé. */}
        <Videochamada atendimentoId={solicitacao.id} papel="tutor" />

        {buscaEncerrada && (
          <BuscaEncerrada
            solicitacaoId={solicitacao.id}
            petNome={solicitacao.pet?.nome}
            onRetomado={(retomada: any) => setSolicitacao((prev: any) => ({ ...prev, ...(retomada || {}) }))}
            onVoltar={() => navigate('/tutor')}
          />
        )}

        {/* Linha do tempo honesta — sem mapa cenográfico */}
        {!encaminhado && !buscaEncerrada && (
          <Panel className="px-4 py-4">
            <Eyebrow className="text-slate-400">Situação agora</Eyebrow>
            <ol className="mt-3 space-y-1">
              {ETAPAS.map((etapa, indice) => {
                const feita = indice < indiceAtual
                const atual = indice === indiceAtual
                return (
                  <li key={etapa.chave} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border text-[0.7rem] ${atual ? 'border-primary bg-primary text-white' : feita ? 'border-teal-200 bg-teal-50 text-primary' : 'border-slate-200 bg-slate-50 text-slate-300'}`}>
                        <Icon name={feita ? 'check' : etapa.icone} size={15} />
                      </span>
                      {indice < ETAPAS.length - 1 && <span className={`w-px flex-1 ${feita ? 'bg-teal-200' : 'bg-slate-200'}`} />}
                    </div>
                    <div className={`pb-3 ${atual ? '' : feita ? 'opacity-80' : 'opacity-45'}`}>
                      <p className="text-[0.82rem] font-semibold text-ink">{etapa.titulo}{atual && <Badge tone="teal"> agora</Badge>}</p>
                      {atual && <p className="mt-0.5 text-[0.72rem] leading-relaxed text-slate-500">{etapa.texto}</p>}
                    </div>
                  </li>
                )
              })}
            </ol>
            {/* O link soltava a pessoa no Google Maps com um pino sem destino —
                inútil justamente quando ela quer saber "está longe ainda?".
                O mapa mostra os dois pontos, e o link continua para quem
                quiser navegar de verdade. */}
            <MapaDoAtendimento
              className="mt-3"
              destino={{ latitude: solicitacao.latitude, longitude: solicitacao.longitude }}
              veterinario={vetLocation}
            />

            {vetLocation && solicitacao.status === 'a_caminho' && (
              <a
                className="mt-2 inline-flex items-center gap-1.5 text-[0.75rem] font-semibold text-primary"
                href={`https://www.google.com/maps?q=${vetLocation.latitude},${vetLocation.longitude}`}
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="route" size={14} /> Abrir no aplicativo de mapas
              </a>
            )}
          </Panel>
        )}

        {/* Anamnese/termos pendentes: o veterinário chega com o contexto pronto */}
        <FormulariosPendentes atendimentoId={solicitacao.id} petId={solicitacao.pet_id || solicitacao.pet?.id} />

        {/* Veterinário — só dados reais */}
        {vetUsuario && (
          <Panel className="px-4 py-4">
            <Eyebrow className="text-slate-400">Veterinário</Eyebrow>
            <div className="mt-2 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
                {vetUsuario.foto_perfil ? <img src={vetUsuario.foto_perfil} alt="" className="h-full w-full object-cover" /> : <Icon name="vet" size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.85rem] font-semibold text-ink">{vetUsuario.nome}</p>
                <p className="truncate text-[0.72rem] text-slate-400">
                  {[vet.especialidade, vet.crmv ? `CRMV ${vet.crmv}` : null].filter(Boolean).join(' · ') || 'Profissional da plataforma'}
                </p>
                {Number(vet.total_atendimentos) > 0 && (
                  <p className="mt-0.5 text-[0.7rem] text-slate-400">
                    ★ {Number(vet.avaliacao_media || 0).toFixed(1)} · {vet.total_atendimentos} atendimentos
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {vetUsuario.telefone && (
                <a href={`tel:${vetUsuario.telefone}`} className="rounded-xl border border-slate-200/80 py-2.5 text-center text-[0.75rem] font-semibold text-ink transition hover:bg-slate-50">Ligar</a>
              )}
              <Link to={`/tutor/chat/${vetUsuario.id}`} className="rounded-xl bg-primary py-2.5 text-center text-[0.75rem] font-semibold text-white transition hover:bg-[#127e82]">
                Conversar no chat
              </Link>
            </div>
            <button type="button" onClick={() => setDenunciar(true)} className="mt-2 w-full text-center text-[0.68rem] font-semibold text-slate-400 transition hover:text-red-500">
              Denunciar conduta deste veterinário
            </button>
          </Panel>
        )}

        {/* Documentos e avaliação ao final */}
        {finalizado && (
          <Panel className="px-4 py-4">
            <Eyebrow className="text-slate-400">Documentos do atendimento</Eyebrow>
            <div className="mt-2 space-y-2">
              {solicitacao.receita_pdf_url && (
                <a href={solicitacao.receita_pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200/80 px-3 py-2.5 text-[0.78rem] font-semibold text-ink transition hover:bg-slate-50">
                  <Icon name="clipboard" size={16} /> Receita (PDF)
                </a>
              )}
              {solicitacao.prontuario_pdf_url && (
                <a href={solicitacao.prontuario_pdf_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-xl border border-slate-200/80 px-3 py-2.5 text-[0.78rem] font-semibold text-ink transition hover:bg-slate-50">
                  <Icon name="clipboard" size={16} /> Prontuário (PDF)
                </a>
              )}
              <Link to={`/tutor/atendimento/${solicitacao.id}/prontuario`} className="flex items-center gap-2 rounded-xl border border-slate-200/80 px-3 py-2.5 text-[0.78rem] font-semibold text-ink transition hover:bg-slate-50">
                <Icon name="history" size={16} /> Ver prontuário completo no app
              </Link>
              <button type="button" onClick={() => navigate(`/tutor/avaliar/${solicitacao.id}`)} className="w-full rounded-xl bg-primary py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]">
                Avaliar atendimento
              </button>
            </div>
          </Panel>
        )}

        {podeCancelar && (
          <button
            type="button"
            onClick={cancelar}
            disabled={cancelando}
            className="w-full rounded-2xl border border-red-200 py-3 text-[0.8rem] font-semibold text-red-500 transition hover:bg-red-50 disabled:opacity-50"
          >
            {cancelando ? 'Cancelando…' : 'Cancelar atendimento'}
          </button>
        )}
      </div>

      {denunciar && vetUsuario && (
        <ReportarViolacaoModal
          usuarioId={vetUsuario.id}
          nomeAlvo={vetUsuario.nome}
          onClose={() => setDenunciar(false)}
        />
      )}
    </div>
  )
}
