import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import {
  TIPOS_ANEXO_ACEITOS,
  editarMensagem,
  enviarAnexo,
  enviarLocalizacaoAtual,
  enviarTexto,
  erroLegivel,
  excluirMensagem,
  formatarTamanho,
  mapaDaLocalizacao,
  marcarComoLida
} from '../../services/chat'
import { useSocket } from '../../contexts/SocketContext'
import { useAuth } from '../../contexts/AuthContext'
import { VetIcon, VetLoading, serviceLabel } from '../../components/veterinario/VetUI'

const horaDe = (valor: string) => new Date(valor).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function VetChat() {
  const navigate = useNavigate()
  const { tutorId } = useParams()
  const [searchParams] = useSearchParams()
  const attendanceId = searchParams.get('atendimento')
  const { user } = useAuth()
  const { socket } = useSocket()
  const [messages, setMessages] = useState<ApiPayload[]>([])
  const [draft, setDraft] = useState('')
  const [tutor, setTutor] = useState<ApiPayload | null>(null)
  const [attendance, setAttendance] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [editando, setEditando] = useState<ApiPayload | null>(null)
  const [menuAberto, setMenuAberto] = useState('')
  const [aExcluir, setAExcluir] = useState<ApiPayload | null>(null)
  const [envioDeArquivo, setEnvioDeArquivo] = useState<ApiPayload | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const arquivoRef = useRef<HTMLInputElement | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const requests = [api.get(`/tutores/${tutorId}`), api.get(`/mensagens/conversa/${tutorId}`)]
      if (attendanceId) requests.push(api.get(`/solicitacoes/${attendanceId}`))
      const [tutorResponse, messagesResponse, attendanceResponse] = await Promise.all(requests)
      setTutor(tutorResponse.data)
      setMessages(Array.isArray(messagesResponse.data)
        ? messagesResponse.data
        : (messagesResponse.data?.mensagens || []))
      if (attendanceResponse) setAttendance(attendanceResponse.data)
    } catch (requestError: any) {
      setError(erroLegivel(requestError, 'Não foi possível carregar a conversa.'))
    } finally {
      setLoading(false)
    }
  }, [tutorId, attendanceId])

  useEffect(() => { load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => {
    if (socket && attendanceId) socket.emit('atendimento:join', { atendimentoId: attendanceId })
  }, [socket, attendanceId])

  const acrescentar = useCallback((message: ApiPayload) => {
    setMessages((previous) => previous.some((item) => item.id === message.id)
      ? previous.map((item) => item.id === message.id ? message : item)
      : [...previous, message])
  }, [])

  useEffect(() => {
    if (!socket) return undefined

    const onMessage = (message: ApiPayload) => {
      if (![message.remetente_id, message.destinatario_id].includes(tutorId)) return
      acrescentar(message)
      if (message.destinatario_id === user?.id) marcarComoLida(message.id)
    }
    const onChange = (message: ApiPayload) => {
      if (![message.remetente_id, message.destinatario_id].includes(tutorId)) return
      setMessages((previous) => previous.map((item) => item.id === message.id ? message : item))
    }
    const onRead = () => {
      setMessages((previous) => previous.map((item) => item.remetente_id === user?.id ? { ...item, lida: true } : item))
    }

    socket.on('nova:mensagem', onMessage)
    socket.on('mensagem:editada', onChange)
    socket.on('mensagem:excluida', onChange)
    socket.on('mensagens:lidas', onRead)
    return () => {
      socket.off('nova:mensagem', onMessage)
      socket.off('mensagem:editada', onChange)
      socket.off('mensagem:excluida', onChange)
      socket.off('mensagens:lidas', onRead)
    }
  }, [socket, tutorId, user?.id, acrescentar])

  const alvo = { destinatarioId: tutorId, atendimentoId: attendanceId || undefined }

  const executar = async (acao: ApiPayload) => {
    setSending(true)
    setError('')
    try {
      const message = await acao()
      if (message) acrescentar(message)
      return true
    } catch (requestError: any) {
      setError(erroLegivel(requestError, 'Não foi possível enviar a mensagem.'))
      return false
    } finally {
      setSending(false)
    }
  }

  const send = async (event: any) => {
    event.preventDefault()
    const content = draft.trim()
    if (!content || sending) return

    if (editando) {
      const ok = await executar(() => editarMensagem(editando.id, content))
      if (ok) { setEditando(null); setDraft('') }
      return
    }

    const ok = await executar(() => enviarTexto({ ...alvo, conteudo: content }))
    if (ok) setDraft('')
  }

  const escolherArquivo = (event: any) => {
    const arquivo = event.target.files?.[0]
    event.target.value = ''
    if (!arquivo) return

    setEnvioDeArquivo({ nome: arquivo.name, tamanho: arquivo.size, progresso: 0 })
    executar(() => enviarAnexo({
      ...alvo,
      arquivo,
      legenda: draft.trim() || undefined,
      aoProgredir: (progresso) => setEnvioDeArquivo((atual: ApiPayload) => atual && { ...atual, progresso })
    }))
      .then((ok) => { if (ok) setDraft('') })
      .finally(() => setEnvioDeArquivo(null))
  }

  const iniciarEdicao = (message: ApiPayload) => {
    setMenuAberto('')
    setEditando(message)
    setDraft(message.conteudo || '')
  }

  const apagar = (message: ApiPayload) => {
    setMenuAberto('')
    setAExcluir(message)
  }

  const confirmarExclusao = async () => {
    const message = aExcluir
    setAExcluir(null)
    if (!message) return
    await executar(() => excluirMensagem(message.id))
  }

  const grouped = messages.reduce((result: Record<string, any[]>, message: ApiPayload) => {
    const date = new Date(message.criado_em)
    const key = Number.isNaN(date.getTime()) ? 'Data não informada' : date.toLocaleDateString('pt-BR')
    if (!result[key]) result[key] = []
    result[key].push(message)
    return result
  }, {})

  const corpoDaMensagem = (message: ApiPayload) => {
    if (message.excluida) return <p className="vet-bubble__deleted">Mensagem apagada</p>

    const anexo = message.anexos?.[0]
    const anexoRemovido = Boolean(anexo?.arquivo_removido)

    return (
      <>
        {anexoRemovido && (
          <p className="vet-bubble__removed">
            <VetIcon name="document" size={15} /> Arquivo removido por política de retenção
          </p>
        )}

        {message.tipo === 'imagem' && anexo && !anexoRemovido && (
          <a href={anexo.url} target="_blank" rel="noreferrer" className="vet-bubble__image">
            <img src={anexo.url} alt={message.conteudo || anexo.nome_original} loading="lazy" />
          </a>
        )}

        {message.tipo === 'video' && anexo && !anexoRemovido && (
          <div className="vet-bubble__video">
            <video src={anexo.url} controls preload="metadata" playsInline>
              Seu navegador não reproduz este vídeo.
            </video>
            <small>{anexo.nome_original} · {formatarTamanho(anexo.tamanho_bytes)}</small>
          </div>
        )}

        {message.tipo === 'documento' && anexo && !anexoRemovido && (
          <a href={anexo.url} target="_blank" rel="noreferrer" className="vet-bubble__file">
            <VetIcon name="document" size={18} />
            <span>
              <strong>{anexo.nome_original}</strong>
              <small>{formatarTamanho(anexo.tamanho_bytes)} · abrir</small>
            </span>
          </a>
        )}

        {message.tipo === 'localizacao' && (
          <a href={mapaDaLocalizacao(message)} target="_blank" rel="noreferrer" className="vet-bubble__location">
            <VetIcon name="pin" size={18} />
            <span>
              <strong>Localização compartilhada</strong>
              <small>{message.endereco || `${message.latitude?.toFixed(5)}, ${message.longitude?.toFixed(5)}`}</small>
            </span>
          </a>
        )}

        {message.conteudo && <p>{message.conteudo}</p>}
      </>
    )
  }

  if (loading) return <main className="vet-app vet-chat"><VetLoading label="Carregando conversa" /></main>

  return (
    <main className="vet-app vet-chat">
      <header className="vet-chat__header">
        <button className="vet-icon-button vet-icon-button--glass" type="button" onClick={() => navigate('/veterinario/mensagens')} aria-label="Voltar"><VetIcon name="back" /></button>
        <div><strong>{tutor?.nome || 'Tutor'}</strong><small>{attendance ? serviceLabel(attendance.tipo_atendimento) : 'Conversa direta'}</small></div>
      </header>

      <section className="vet-chat__messages" aria-live="polite">
        {error && <div className="vet-card vet-request" role="alert">{error}</div>}
        {!messages.length && !error && <div className="vet-empty"><VetIcon name="message" size={38} /><strong>Nenhuma mensagem ainda</strong><p>Envie a primeira mensagem.</p></div>}

        {Object.entries(grouped).map(([date, dateMessages]) => (
          <div key={date}>
            <p className="vet-chat__date">{date}</p>
            {dateMessages.map((message: ApiPayload) => {
              const mine = message.remetente_id === user?.id
              const podeEditar = mine && !message.excluida && message.tipo === 'texto'
              return (
                <div className={`vet-bubble-row ${mine ? 'is-mine' : ''}`} key={message.id}>
                  <div className={`vet-bubble ${message.excluida ? 'is-deleted' : ''}`}>
                    {!mine && <strong>{message.remetente?.nome || tutor?.nome || 'Tutor'}</strong>}
                    {corpoDaMensagem(message)}
                    <time>
                      {horaDe(message.criado_em)}
                      {message.editada_em && !message.excluida && <span className="vet-bubble__edited"> · editada</span>}
                      {mine && !message.excluida && <span className="vet-bubble__read">{message.lida ? ' · lida' : ' · enviada'}</span>}
                    </time>

                    {mine && !message.excluida && (
                      <div className="vet-bubble__actions">
                        <button type="button" aria-label="Opções da mensagem" onClick={() => setMenuAberto(menuAberto === message.id ? '' : message.id)}>
                          <VetIcon name="more" size={17} strokeWidth={2.6} />
                        </button>
                        {menuAberto === message.id && (
                          <div className="vet-bubble__menu" role="menu">
                            {podeEditar && <button type="button" onClick={() => iniciarEdicao(message)}>Editar</button>}
                            <button type="button" onClick={() => apagar(message)}>Apagar</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={endRef} />
      </section>

      {editando && (
        <div className="vet-chat__editing">
          <span>Editando mensagem — a versão original fica registrada.</span>
          <button type="button" onClick={() => { setEditando(null); setDraft('') }}>Cancelar</button>
        </div>
      )}

      {envioDeArquivo && (
        <div className="vet-chat__uploading" role="status" aria-live="polite">
          <span>Enviando {envioDeArquivo.nome} · {formatarTamanho(envioDeArquivo.tamanho)}</span>
          <strong>{envioDeArquivo.progresso}%</strong>
          <i style={{ width: `${envioDeArquivo.progresso}%` }} />
        </div>
      )}

      <form className="vet-chat__composer" onSubmit={send}>
        <input ref={arquivoRef} type="file" accept={TIPOS_ANEXO_ACEITOS} onChange={escolherArquivo} hidden />
        <button className="vet-chat__action-btn" type="button" onClick={() => arquivoRef.current?.click()} disabled={sending || Boolean(editando)} aria-label="Enviar foto, vídeo ou documento">
          <VetIcon name="image" size={19} strokeWidth={1.7} />
        </button>
        <button className="vet-chat__action-btn" type="button" onClick={() => executar(() => enviarLocalizacaoAtual(alvo))} disabled={sending || Boolean(editando)} aria-label="Enviar minha localização">
          <VetIcon name="pin" size={19} strokeWidth={1.7} />
        </button>
        <div className="vet-chat__input-box">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder={editando ? 'Corrija a mensagem…' : 'Digite uma mensagem…'} aria-label="Mensagem" />
          <button className="vet-chat__send-inline" type="submit" disabled={!draft.trim() || sending} aria-label={editando ? 'Salvar edição' : 'Enviar mensagem'}>
            <VetIcon name={editando ? 'check' : 'send'} size={16} strokeWidth={2} />
          </button>
        </div>
      </form>

      {aExcluir && (
        <div
          className="vet-modal-layer"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && setAExcluir(null)}
        >
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="apagar-titulo">
            <div className="vet-modal__title">
              <VetIcon name="document" />
              <h2 id="apagar-titulo">Apagar mensagem</h2>
              <button className="vet-icon-button" type="button" onClick={() => setAExcluir(null)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <p className="vet-confirm__text">
              Apagar esta mensagem para os dois lados? O registro fica guardado para auditoria.
            </p>

            <div className="vet-confirm__actions">
              <button type="button" className="vet-button--ghost" onClick={() => setAExcluir(null)}>
                Manter mensagem
              </button>
              <button type="button" className="vet-button--secondary" disabled={sending} onClick={confirmarExclusao}>
                Apagar
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  )
}
