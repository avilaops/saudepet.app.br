import type { ApiPayload } from '../types/api'
import { useEffect, useState } from 'react'
import api from '../services/api'
import { ativarPush, desativarPush, inscricaoConfirmada, suportaPush } from '../lib/push'
import { Panel } from './ui/AppKit'

/**
 * Bloco de preferências de notificação + situação da conta na moderação.
 * Fecha o ciclo do push (dava para ligar, não para desligar) e dá ao usuário
 * visibilidade das advertências/punições que recebeu (GET /moderacao/meu-status).
 */
export default function NotificacoesPreferencias() {
  const [estado, setEstado] = useState('carregando') // carregando | sem-suporte | negado | ativo | inativo
  const [ocupado, setOcupado] = useState(false)
  const [statusModeracao, setStatusModeracao] = useState<ApiPayload | null>(null)

  const atualizarEstado = async () => {
    if (!suportaPush()) {
      setEstado('sem-suporte')
      return
    }
    if (Notification.permission === 'denied') {
      setEstado('negado')
      return
    }
    // Pelo SERVIDOR, não pelo navegador: é ele quem envia, e é a discordância
    // entre os dois que produz "ativo" sem nenhum aviso chegando.
    setEstado((await inscricaoConfirmada()) ? 'ativo' : 'inativo')
  }

  useEffect(() => {
    atualizarEstado()
    api.get('/moderacao/meu-status')
      .then((r) => setStatusModeracao(r.data))
      .catch(() => {})
  }, [])

  const alternar = async () => {
    setOcupado(true)
    try {
      if (estado === 'ativo') await desativarPush()
      else await ativarPush()
      await atualizarEstado()
    } catch (error: any) {
      console.error('Preferência de push não aplicada:', error)
    } finally {
      setOcupado(false)
    }
  }

  const punicoesAtivas = statusModeracao?.punicoes_ativas || statusModeracao?.punicoesAtivas || []
  const historico = statusModeracao?.historico

  return (
    /* Sem empilhamento próprio: quem chama já espaça os blocos (PageBody), e
       um `space-y` aqui dentro somava com o de fora entre estes dois cartões. */
    <>
      {/* Push */}
      <Panel className="px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.85rem] font-semibold text-ink">Notificações push</p>
            <p className="mt-0.5 text-[0.72rem] leading-snug text-slate-400">
              {estado === 'sem-suporte' && 'Este navegador não suporta notificações push.'}
              {estado === 'negado' && 'Permissão negada no navegador — reative nas configurações do site.'}
              {estado === 'ativo' && 'Você recebe avisos do atendimento mesmo com o app fechado.'}
              {estado === 'inativo' && 'Ative para saber na hora quando o atendimento avançar.'}
              {estado === 'carregando' && 'Verificando…'}
            </p>
          </div>
          {(estado === 'ativo' || estado === 'inativo') && (
            <button
              onClick={alternar}
              disabled={ocupado}
              role="switch"
              aria-checked={estado === 'ativo'}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${estado === 'ativo' ? 'bg-teal-500' : 'bg-slate-200'} ${ocupado ? 'opacity-60' : ''}`}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ left: estado === 'ativo' ? 'calc(100% - 1.375rem)' : '0.125rem' }}
              />
            </button>
          )}
        </div>
      </Panel>

      {/* Situação na moderação: só aparece se houver algo a dizer */}
      {(punicoesAtivas.length > 0 || (historico && historico.total_violacoes > 0)) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-[0.85rem] font-semibold text-amber-900">Situação da conta</p>
          {historico && historico.total_violacoes > 0 && (
            <p className="mt-1 text-[0.72rem] text-amber-800">
              {historico.total_violacoes} ocorrência(s) registrada(s)
              {historico.advertencias ? ` · ${historico.advertencias} advertência(s)` : ''}
            </p>
          )}
          {punicoesAtivas.map((p: ApiPayload) => (
            <p key={p.id} className="mt-1.5 rounded-xl bg-white/70 px-3 py-2 text-[0.72rem] text-amber-900">
              <strong>
                {(({ advertencia: 'Advertência', suspensao_temp: 'Suspensão temporária', suspensao_perm: 'Suspensão permanente', restricao_funcao: 'Restrição de função' } as Record<string, string>)[p.tipo] || p.tipo)}
              </strong>
              {p.termina_em ? ` até ${new Date(p.termina_em).toLocaleDateString('pt-BR')}` : ''} — {p.motivo}
            </p>
          ))}
        </div>
      )}
    </>
  )
}
