import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import { EmptyState, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { avisarMudancaDeAvisos } from '../../lib/avisos-do-app'

export interface ItemNotificacao {
  id: string
  titulo: string
  mensagem: string
  criado_em: string
  lida: boolean
  link?: string | null
  icone: string
  urgente?: boolean
}

/**
 * "Há 15 minutos", a partir da data real.
 *
 * A tela antiga trazia esse texto pronto do próprio código, porque as quatro
 * notificações eram fixas: "Há 15 minutos" ficou congelado por meses.
 */
function quandoFoi(iso: string): string {
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return ''

  const segundos = Math.floor((Date.now() - data.getTime()) / 1000)
  if (segundos < 60) return 'Agora'
  if (segundos < 3600) {
    const minutos = Math.floor(segundos / 60)
    return `Há ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`
  }
  if (segundos < 86400) {
    const horas = Math.floor(segundos / 3600)
    return `Há ${horas} ${horas === 1 ? 'hora' : 'horas'}`
  }
  if (segundos < 172800) return 'Ontem'

  return data.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * A central de notificações.
 *
 * Uma lista só, sem abas. A primeira versão dividia os avisos em quatro
 * categorias e abria numa aba fixa: o veterinário via "2" no sino, entrava e
 * encontrava a tela vazia, porque os avisos estavam nas outras abas. Notificação
 * é notificação — o que importa é o recado e para onde ele leva.
 */
export default function NotificacoesCentral() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [itens, setItens] = useState<ItemNotificacao[]>([])
  const [naoLidas, setNaoLidas] = useState(0)
  const [proximoCursor, setProximoCursor] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [carregandoMais, setCarregandoMais] = useState(false)
  const [erro, setErro] = useState('')

  const getDispositivosRoute = () => {
    if (user?.tipo_usuario === 'veterinario') return '/veterinario/dispositivos'
    if (user?.tipo_usuario === 'super_admin' || user?.tipo_usuario === 'admin') return '/admin/dispositivos'
    return '/tutor/dispositivos'
  }

  const getHomeRoute = () => {
    if (user?.tipo_usuario === 'veterinario') return '/veterinario/home'
    if (user?.tipo_usuario === 'super_admin' || user?.tipo_usuario === 'admin') return '/admin/dashboard'
    return '/tutor/home'
  }

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const { data } = await api.get('/v1/minhas-notificacoes')
      setItens(data.notificacoes || [])
      setNaoLidas(data.naoLidas || 0)
      setProximoCursor(data.proximoCursor || null)
    } catch {
      setErro('Não foi possível carregar suas notificações.')
      setItens([])
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const carregarMais = async () => {
    if (!proximoCursor || carregandoMais) return
    setCarregandoMais(true)
    try {
      const { data } = await api.get('/v1/minhas-notificacoes', { params: { antes_de: proximoCursor } })
      setItens((atuais) => [...atuais, ...(data.notificacoes || [])])
      setProximoCursor(data.proximoCursor || null)
    } catch {
      setErro('Não foi possível carregar mais notificações.')
    } finally {
      setCarregandoMais(false)
    }
  }

  const marcarComoLida = async (item: ItemNotificacao) => {
    if (item.lida) return
    setItens((atuais) => atuais.map((i) => (i.id === item.id ? { ...i, lida: true } : i)))
    try {
      const { data } = await api.patch(`/v1/minhas-notificacoes/${item.id}/lida`)
      setNaoLidas(data.naoLidas ?? 0)
      avisarMudancaDeAvisos()
    } catch {
      // Falhou: devolve a linha ao estado anterior em vez de mentir que leu.
      setItens((atuais) => atuais.map((i) => (i.id === item.id ? { ...i, lida: false } : i)))
    }
  }

  /**
   * Tocar no recado marca como lido e abre a tela do que aconteceu. Sem link,
   * ele só é marcado — não há para onde levar, e fingir que há é pior.
   */
  const abrir = (item: ItemNotificacao) => {
    marcarComoLida(item)
    if (item.link) navigate(item.link)
  }

  const marcarTodasComoLidas = async () => {
    try {
      await api.post('/v1/minhas-notificacoes/lidas')
      setItens((atuais) => atuais.map((item) => ({ ...item, lida: true })))
      setNaoLidas(0)
      avisarMudancaDeAvisos()
    } catch {
      setErro('Não foi possível marcar as notificações como lidas.')
    }
  }

  return (
    <div className="min-h-screen bg-surface-page pb-24">
      <PageHeader
        title="Notificações"
        subtitle={naoLidas > 0
          ? `${naoLidas} ${naoLidas === 1 ? 'aviso não lido' : 'avisos não lidos'}`
          : 'Seus avisos e atualizações'}
        onBack={() => navigate(getHomeRoute())}
        action={
          <button
            type="button"
            onClick={() => navigate(getDispositivosRoute())}
            className="flex items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[0.72rem] font-semibold text-white/90 transition hover:bg-white/10"
            title="Gerenciar aparelhos"
          >
            <Icon name="bell" size={14} />
            <span>Dispositivos</span>
          </button>
        }
      />

      <div className="mx-auto max-w-2xl space-y-3 px-4 pt-4">
        {erro && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.78rem] text-amber-800" role="alert">
            {erro}
          </div>
        )}

        {naoLidas > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={marcarTodasComoLidas}
              className="text-[0.72rem] font-semibold text-primary transition hover:underline"
            >
              Marcar todas como lidas
            </button>
          </div>
        )}

        {carregando ? (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-2xl border border-slate-200/80 bg-white" />
            ))}
          </div>
        ) : itens.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nenhuma notificação por aqui"
            description="Quando houver novidades sobre seus atendimentos ou sua conta, elas aparecem nesta tela."
          />
        ) : (
          <>
            {itens.map((item) => {
              // O recado inteiro é o alvo do toque quando há para onde ir.
              // Botãozinho de "ver detalhes" no rodapé do card obrigava mira
              // fina no celular para fazer o que o card todo já sugere.
              const Container = item.link ? 'button' : 'div'
              return (
                <Panel
                  key={item.id}
                  as={Container}
                  {...(item.link
                    ? { type: 'button', onClick: () => abrir(item) }
                    : { onClick: () => marcarComoLida(item) })}
                  className={`block w-full p-4 text-left transition ${
                    item.lida ? 'bg-white' : 'border-primary/30 bg-primary/[0.02]'
                  } ${item.link ? 'cursor-pointer hover:bg-slate-50 active:scale-[0.995]' : ''}`}
                >
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                        item.urgente
                          ? 'bg-amber-100 text-amber-700'
                          : !item.lida
                          ? 'bg-primary/15 text-primary'
                          : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon name={item.icone} size={18} />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-[0.82rem] font-bold text-ink">{item.titulo}</h4>
                        <span className="shrink-0 pt-0.5 text-[10px] text-slate-400">{quandoFoi(item.criado_em)}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600">{item.mensagem}</p>
                    </div>

                    {item.link && (
                      <Icon name="chevron" size={16} className="mt-1 shrink-0 text-slate-300" />
                    )}
                  </div>
                </Panel>
              )
            })}

            {proximoCursor && (
              <button
                type="button"
                onClick={carregarMais}
                disabled={carregandoMais}
                className="w-full rounded-2xl border border-slate-200 bg-white py-3 text-[0.78rem] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
              >
                {carregandoMais ? 'Carregando…' : 'Carregar mais'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
