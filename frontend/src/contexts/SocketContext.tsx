import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { io, type Socket } from 'socket.io-client'
import { useAuth } from './AuthContext'
import type { Mensagem, Solicitacao } from '../types/api'

/**
 * O valor padrão declara a FORMA do contexto, não só um objeto vazio.
 *
 * Com `{}`, o TypeScript infere `{}` como tipo de `useSocket()` e qualquer tela
 * `.tsx` que faça `const { socket } = useSocket()` para de compilar. Tela nova
 * nasce `.tsx` (ver ROADMAP, Fase 1), então a forma declarada aqui é o que
 * mantém isso funcionando sem `as any` espalhado pelas telas.
 */
interface SocketContextValue {
  socket: Socket | null
  connected: boolean
  emitVeterinarioOnline: () => void
  emitVeterinarioOffline: () => void
  emitNovaSolicitacao: (solicitacao: Pick<Solicitacao, 'id'>) => void
  emitSolicitacaoAceita: (dados: { solicitacaoId?: string; id?: string; [key: string]: any }) => void
  emitAtualizacaoStatus: (dados: { solicitacaoId?: string; id?: string; [key: string]: any }) => void
  emitMensagemChat: (mensagem: Pick<Mensagem, 'id'>) => void
}

const SocketContext = createContext<SocketContextValue | null>(null)

// Em produção não há VITE_SOCKET_URL definido de propósito: o nginx do container
// faz proxy de /socket.io/ pro backend no mesmo domínio, então o certo é conectar
// na própria origem (window.location.origin), não em localhost.
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin)

export function SocketProvider({ children }: { children: ReactNode }) {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [connected, setConnected] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    if (user) {
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: { token: localStorage.getItem('token') }
      })

      newSocket.on('connect', () => {
        console.log('Socket conectado')
        setConnected(true)

        // A identidade vem do token validado pelo servidor. O cliente apenas
        // solicita a alteracao de presenca da propria conta autenticada.
        if (user.tipo_usuario === 'veterinario' && user.veterinario) {
          newSocket.emit('veterinario:online')
        } else if (user.tipo_usuario === 'tutor') {
          newSocket.emit('tutor:connect')
        }
      })

      newSocket.on('connect_error', () => {
        setConnected(false)
      })

      newSocket.on('disconnect', () => {
        console.log('Socket desconectado')
        setConnected(false)
      })

      setSocket(newSocket)

      return () => {
        newSocket.close()
      }
    }
  }, [user])

  const emitVeterinarioOnline = () => {
    if (socket) {
      socket.emit('veterinario:online')
    }
  }

  const emitVeterinarioOffline = () => {
    if (socket) {
      socket.emit('veterinario:offline')
    }
  }

  const emitNovaSolicitacao = (solicitacao: Pick<Solicitacao, 'id'>) => {
    if (socket && solicitacao?.id) {
      socket.emit('solicitacao:nova', { solicitacaoId: solicitacao.id })
    }
  }

  const emitSolicitacaoAceita = (dados: { solicitacaoId?: string; id?: string }) => {
    const solicitacaoId = dados?.solicitacaoId || dados?.id
    if (socket && solicitacaoId) {
      socket.emit('solicitacao:aceita', { solicitacaoId })
    }
  }

  const emitAtualizacaoStatus = (dados: { solicitacaoId?: string; id?: string }) => {
    const solicitacaoId = dados?.solicitacaoId || dados?.id
    if (socket && solicitacaoId) {
      socket.emit('atendimento:status', { solicitacaoId })
    }
  }

  const emitMensagemChat = (mensagem: Pick<Mensagem, 'id'>) => {
    if (socket && mensagem?.id) {
      socket.emit('chat:mensagem', { mensagemId: mensagem.id })
    }
  }

  return (
    <SocketContext.Provider
      value={{
        socket,
        connected,
        emitVeterinarioOnline,
        emitVeterinarioOffline,
        emitNovaSolicitacao,
        emitSolicitacaoAceita,
        emitAtualizacaoStatus,
        emitMensagemChat
      }}
    >
      {children}
    </SocketContext.Provider>
  )
}

export function useSocket() {
  const context = useContext(SocketContext)
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider')
  }
  return context
}
