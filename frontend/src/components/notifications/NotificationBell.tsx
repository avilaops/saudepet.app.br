import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Icon } from '../ui/AppKit'
import api from '../../services/api'
import { assinarAvisosDoApp, avisosDoApp, type AvisoDoApp } from '../../lib/avisos-do-app'

interface Props {
  /** Só para quem já tem o número em mãos; sem isto o sino busca sozinho. */
  unreadCount?: number
  className?: string
}

/**
 * O sino é onde recado curto mora.
 *
 * Antes, um recado do aplicativo (notificação bloqueada) era desenhado como
 * faixa no meio da home e empurrava o conteúdo para baixo em toda visita. O
 * sino já estava aqui no canto e só navegava. Agora ele abre a lista: recados
 * do aplicativo primeiro, e o caminho para a central de notificações embaixo.
 */
export default function NotificationBell({ unreadCount, className = '' }: Props) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const [avisos, setAvisos] = useState<AvisoDoApp[]>(() => avisosDoApp())
  const [naoLidas, setNaoLidas] = useState(unreadCount ?? 0)
  const caixaRef = useRef<HTMLDivElement>(null)

  useEffect(() => assinarAvisosDoApp(() => setAvisos(avisosDoApp())), [])

  // O número do sino vem do servidor. Quem já o tem passa por `unreadCount` e
  // esta busca não acontece.
  const buscarNaoLidas = useCallback(() => {
    if (unreadCount !== undefined) return
    api.get('/v1/minhas-notificacoes/nao-lidas')
      .then(({ data }) => setNaoLidas(data.naoLidas || 0))
      .catch(() => {})
  }, [unreadCount])

  useEffect(() => {
    if (unreadCount !== undefined) { setNaoLidas(unreadCount); return }
    buscarNaoLidas()
    // Marcar como lida na central dispara o mesmo evento dos avisos: o sino
    // acompanha sem que a página precise conhecê-lo.
    return assinarAvisosDoApp(buscarNaoLidas)
  }, [unreadCount, buscarNaoLidas])

  // Fechar clicando fora e no Esc: a lista é um menu, e menu que só fecha no
  // próprio botão prende quem abriu por engano.
  useEffect(() => {
    if (!aberto) return

    const aoClicarFora = (evento: MouseEvent) => {
      if (!caixaRef.current?.contains(evento.target as Node)) setAberto(false)
    }
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') setAberto(false)
    }

    document.addEventListener('mousedown', aoClicarFora)
    document.addEventListener('keydown', aoTeclar)
    return () => {
      document.removeEventListener('mousedown', aoClicarFora)
      document.removeEventListener('keydown', aoTeclar)
    }
  }, [aberto])

  const rotaDaCentral = user?.tipo_usuario === 'veterinario'
    ? '/veterinario/notificacoes'
    : (user?.tipo_usuario === 'super_admin' || user?.tipo_usuario === 'admin')
      ? '/admin/notificacoes'
      : '/tutor/notificacoes'

  const irParaCentral = () => {
    setAberto(false)
    navigate(rotaDaCentral)
  }

  const total = avisos.length + naoLidas

  return (
    <div className="relative" ref={caixaRef}>
      <button
        type="button"
        onClick={() => setAberto((valor) => !valor)}
        className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/85 transition hover:bg-white/10 active:scale-95 ${className}`}
        aria-label="Abrir central de notificações"
        aria-expanded={aberto}
        aria-haspopup="menu"
        title="Notificações"
      >
        <Icon name="bell" size={17} />
        {total > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-white shadow-sm ring-2 ring-ink">
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {aberto && (
        // Ancorado à direita e limitado pela largura da tela: no celular a
        // caixa não pode vazar para fora da borda.
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-black/5 bg-white text-ink shadow-xl"
        >
          <div className="border-b border-black/5 px-4 py-3">
            <p className="text-[0.8rem] font-semibold text-ink">Notificações</p>
          </div>

          {avisos.length > 0 && (
            <ul className="divide-y divide-black/5">
              {avisos.map((aviso) => (
                <li key={aviso.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                    <Icon name="alert" size={15} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.78rem] font-semibold text-ink">{aviso.titulo}</p>
                    <p className="mt-0.5 text-[0.7rem] leading-snug text-slate-500">{aviso.mensagem}</p>
                    {aviso.para && (
                      <button
                        type="button"
                        className="mt-1.5 text-[0.7rem] font-semibold text-primary"
                        onClick={() => { setAberto(false); navigate(aviso.para as string) }}
                      >
                        {aviso.textoDaAcao || 'Resolver'}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {naoLidas > 0 && (
            <button
              type="button"
              onClick={irParaCentral}
              className="flex w-full items-start gap-3 border-t border-black/5 px-4 py-3 text-left transition hover:bg-black/[0.03]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name="bell" size={15} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[0.78rem] font-semibold text-ink">
                  {naoLidas === 1 ? '1 notificação não lida' : `${naoLidas} notificações não lidas`}
                </span>
                <span className="mt-0.5 block text-[0.7rem] text-slate-500">Toque para ver na central.</span>
              </span>
            </button>
          )}

          {avisos.length === 0 && naoLidas === 0 && (
            <p className="px-4 py-5 text-center text-[0.72rem] text-slate-500">
              Nada por aqui agora.
            </p>
          )}

          <button
            type="button"
            role="menuitem"
            onClick={irParaCentral}
            className="flex w-full items-center justify-between gap-2 border-t border-black/5 px-4 py-3 text-left text-[0.75rem] font-semibold text-ink transition hover:bg-black/[0.03]"
          >
            Ver todas as notificações
            <Icon name="chevron" size={14} className="text-slate-400" />
          </button>
        </div>
      )}
    </div>
  )
}
