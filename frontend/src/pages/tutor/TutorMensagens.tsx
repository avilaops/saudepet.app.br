import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Icon, PageHeader, Panel } from '../../components/ui/AppKit'

export default function TutorMensagens() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { socket } = useSocket()
  const [conversas, setConversas] = useState<ApiPayload[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState('')

  const carregarConversas = useCallback(async () => {
    setErro('')
    try {
      const response = await api.get('/mensagens/conversas')
      setConversas(Array.isArray(response.data) ? response.data : [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar suas conversas.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregarConversas() }, [carregarConversas])

  useEffect(() => {
    if (!socket) return undefined
    const aoReceber = (mensagem: ApiPayload) => {
      const remetente = mensagem.remetente_id ?? mensagem.remetenteId
      const destinatario = mensagem.destinatario_id ?? mensagem.destinatarioId
      // Só conta como "não lida" o que veio DO OUTRO lado — a versão anterior
      // incrementava o contador também para as mensagens do próprio tutor.
      const veioDoOutro = remetente && remetente !== user?.id
      setConversas((prev) => {
        const existente = prev.find((c) => c.usuario?.id === remetente || c.usuario?.id === destinatario)
        if (!existente) {
          carregarConversas()
          return prev
        }
        return prev.map((c) =>
          (c.usuario?.id === remetente || c.usuario?.id === destinatario)
            ? {
                ...c,
                ultimaMensagem: mensagem,
                naoLidas: veioDoOutro ? (c.naoLidas || 0) + 1 : c.naoLidas || 0,
                horario: mensagem.criado_em ?? mensagem.criadoEm
              }
            : c
        )
      })
    }
    socket.on('nova:mensagem', aoReceber)
    return () => {
      socket.off('nova:mensagem', aoReceber)
    }
  }, [socket, user?.id, carregarConversas])

  const abrirChat = (veterinarioId: ApiPayload, atendimentoId = null) => {
    navigate(`/tutor/chat/${veterinarioId}${atendimentoId ? `?atendimento=${atendimentoId}` : ''}`)
  }

  const formatarHorario = (data: ApiPayload) => {
    if (!data) return ''
    return new Date(data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader title="Mensagens" subtitle="Conversas com veterinários" onBack={() => navigate('/tutor/home')} />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
            <button type="button" className="ml-2 font-bold underline" onClick={() => { setLoading(true); carregarConversas() }}>Tentar novamente</button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-16">
            <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" aria-label="Carregando" />
          </div>
        ) : conversas.length === 0 && !erro ? (
          <Panel className="px-6 py-12 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
              <Icon name="message" size={20} />
            </span>
            <h3 className="mt-3 text-[0.9rem] font-semibold text-ink">Nenhuma conversa ainda</h3>
            <p className="mx-auto mt-1.5 max-w-xs text-[0.75rem] leading-relaxed text-slate-400">
              Suas mensagens com veterinários aparecerão aqui após o primeiro atendimento.
            </p>
          </Panel>
        ) : (
          <Panel className="divide-y divide-slate-100 overflow-hidden">
            {conversas.map((conversa) => (
              <button
                key={conversa.usuario?.id}
                onClick={() => abrirChat(conversa.usuario?.id, conversa.ultimaMensagem?.atendimento_id)}
                className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
              >
                <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
                  {conversa.usuario?.foto_perfil
                    ? <img src={conversa.usuario?.foto_perfil} alt="" className="h-full w-full object-cover" />
                    : <Icon name="vet" size={20} />}
                  {conversa.usuario?.online && (
                    <span className="absolute bottom-0.5 right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[0.85rem] font-semibold text-ink">{conversa.usuario?.nome || 'Veterinário'}</span>
                    {conversa.ultimaMensagem?.criado_em && <span className="shrink-0 text-[0.68rem] text-slate-400">{formatarHorario(conversa.ultimaMensagem.criado_em)}</span>}
                  </span>
                  <span className="mt-0.5 block truncate text-[0.74rem] text-slate-400">{conversa.ultimaMensagem?.conteudo || 'Nenhuma mensagem'}</span>
                </span>
                {conversa.naoLidas > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[0.65rem] font-bold text-white">
                    {conversa.naoLidas}
                  </span>
                )}
              </button>
            ))}
          </Panel>
        )}
      </div>

      <TutorBottomNav />
    </div>
  )
}
