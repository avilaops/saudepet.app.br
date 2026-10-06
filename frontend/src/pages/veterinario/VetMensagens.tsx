import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useSocket } from '../../contexts/SocketContext'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader, formatDate, serviceLabel } from '../../components/veterinario/VetUI'

export default function VetMensagens() {
  const navigate = useNavigate()
  const { socket } = useSocket()
  const [conversations, setConversations] = useState<ApiPayload[]>([])
  const [contacts, setContacts] = useState<ApiPayload[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [conversationsResponse, contactsResponse] = await Promise.all([
        api.get('/mensagens/conversas'),
        api.get('/mensagens/contatos').catch(() => ({ data: [] }))
      ])
      setConversations(Array.isArray(conversationsResponse.data) ? conversationsResponse.data : [])
      setContacts(Array.isArray(contactsResponse.data) ? contactsResponse.data : [])
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar as mensagens.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!socket) return undefined
    const onMessage = () => load()
    socket.on('nova:mensagem', onMessage)
    return () => {
      socket.off('nova:mensagem', onMessage)
    }
  }, [socket, load])

  const openConversation = (conversation: ApiPayload) => {
    const userId = conversation.usuario?.id
    if (!userId) return
    const attendanceId = conversation.ultimaMensagem?.atendimento_id
    navigate(`/veterinario/chat/${userId}${attendanceId ? `?atendimento=${attendanceId}` : ''}`)
  }

  const openContact = (contact: ApiPayload) => {
    const userId = contact.usuario?.id
    if (!userId) return
    const attendanceId = contact.ultimoAtendimento?.id
    navigate(`/veterinario/chat/${userId}${attendanceId ? `?atendimento=${attendanceId}` : ''}`)
  }

  const time = (value: ApiPayload) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

  const termo = search.trim().toLowerCase()
  const contatosVisiveis = contacts.filter((contact) => !termo || (contact.usuario?.nome || '').toLowerCase().includes(termo))

  return (
    <main className="vet-app">
      <VetPageHeader
        title="Mensagens"
        onBack={() => navigate('/veterinario/home')}
        action={
          <button
            className="vet-icon-button vet-icon-button--glass"
            type="button"
            onClick={() => { setSearch(''); setPickerOpen(true) }}
            aria-label="Iniciar nova conversa"
          >
            <VetIcon name="plus" size={18} />
          </button>
        }
      />

      {loading ? <VetLoading label="Carregando conversas" /> : error ? (
        <div className="vet-list">
          <div className="vet-card vet-empty" role="alert">
            <strong>{error}</strong>
            <button className="vet-button--primary" onClick={load}>Tentar novamente</button>
          </div>
        </div>
      ) : conversations.length === 0 ? (
        <div className="vet-list">
          <div className="vet-card vet-empty">
            <VetIcon name="message" size={40} />
            <strong>Nenhuma conversa ainda</strong>
            <p>
              {contacts.length
                ? 'Toque em + para escrever para um tutor que você já atendeu.'
                : 'As conversas com os tutores aparecerão aqui.'}
            </p>
            {contacts.length > 0 && (
              <button className="vet-button--primary" type="button" onClick={() => setPickerOpen(true)}>
                Escrever para um tutor
              </button>
            )}
          </div>
        </div>
      ) : (
        <section className="vet-conversations" aria-label="Conversas">
          {conversations.map((conversation) => (
            <button className="vet-conversation" type="button" key={conversation.usuario?.id} onClick={() => openConversation(conversation)}>
              <span className="vet-conversation__avatar"><VetIcon name="user" /></span>
              <span>
                <strong>{conversation.usuario?.nome || 'Tutor'}</strong>
                <p>{conversation.ultimaMensagem?.conteudo || 'Nenhuma mensagem'}</p>
              </span>
              <span>
                <time>{time(conversation.ultimaMensagem?.criado_em)}</time>
                {conversation.naoLidas > 0 && (
                  <span className="vet-unread" aria-label={`${conversation.naoLidas} mensagens não lidas`}>{conversation.naoLidas}</span>
                )}
              </span>
            </button>
          ))}
        </section>
      )}

      {pickerOpen && (
        <div className="vet-modal-layer" role="presentation">
          <section className="vet-modal" role="dialog" aria-modal="true" aria-labelledby="novo-contato-titulo">
            <div className="vet-modal__title">
              <VetIcon name="message" />
              <h2 id="novo-contato-titulo">Escrever para um tutor</h2>
              <button className="vet-icon-button" type="button" onClick={() => setPickerOpen(false)} aria-label="Fechar">
                <VetIcon name="close" size={18} />
              </button>
            </div>

            <div className="vet-prescription-note">
              <label>
                Buscar tutor
                <input
                  className="input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome do tutor"
                  autoFocus
                />
              </label>
            </div>

            <div className="vet-contact-list">
              {contatosVisiveis.length === 0 ? (
                <p className="vet-contact-empty">
                  {contacts.length
                    ? 'Nenhum tutor encontrado com esse nome.'
                    : 'Você poderá escrever para os tutores depois do primeiro atendimento.'}
                </p>
              ) : contatosVisiveis.map((contact) => (
                <button className="vet-conversation" type="button" key={contact.usuario.id} onClick={() => openContact(contact)}>
                  <span className="vet-conversation__avatar"><VetIcon name="user" /></span>
                  <span>
                    <strong>{contact.usuario.nome}</strong>
                    <p>
                      {serviceLabel(contact.ultimoAtendimento?.tipo_atendimento)}
                      {contact.ultimoAtendimento?.pet?.nome ? ` • ${contact.ultimoAtendimento.pet.nome}` : ''}
                      {` • ${formatDate(contact.ultimoAtendimento?.criado_em)}`}
                    </p>
                  </span>
                  <VetIcon name="chevron" size={17} />
                </button>
              ))}
            </div>
          </section>
        </div>
      )}

      <VetBottomNav />
    </main>
  )
}
