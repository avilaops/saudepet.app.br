import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import api from '../../services/api'
import {
  Activity,
  AlertTriangle,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  Star,
  Stethoscope,
  Users,
} from 'lucide-react'

/**
 * Painel de entrada do admin, no padrão torre de controle. A navegação entre
 * seções vive no AdminShell; aqui ficam os números que pedem decisão.
 */
export default function AdminDashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/admin/dashboard')
      .then((response) => setStats(response.data))
      .catch((error) => console.error('Erro ao carregar dashboard:', error))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-xs font-bold text-slate-400">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando painel…
      </div>
    )
  }

  const pendentes = stats?.usuarios?.veterinarios_pendentes || 0
  const online = stats?.veterinarios?.online || 0
  const totalAvaliacoes = stats?.avaliacoes?.total || 0
  const media = Number(stats?.avaliacoes?.media_geral || 0)

  const metricas = [
    { rotulo: 'Usuários', valor: stats?.usuarios?.total || 0, icone: Users },
    { rotulo: 'Tutores', valor: stats?.usuarios?.tutores || 0, icone: Users },
    { rotulo: 'Veterinários', valor: stats?.usuarios?.veterinarios || 0, icone: Stethoscope, nota: pendentes > 0 ? `${pendentes} na fila` : 'Todos aprovados' },
    { rotulo: 'Em plantão', valor: online, icone: Activity, vivo: online > 0 },
  ]

  return (
    // Coluna estreita de propósito: o painel de entrada é resumo, não tabela larga.
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Cabeçalho */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="h-5 w-5 text-teal-600" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-teal-600">Administração</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Painel operacional</h1>
        <p className="mt-0.5 text-xs text-slate-500">{user?.nome}</p>
      </div>

      {/* Pendência que exige ação vem antes dos números */}
      {pendentes > 0 && (
        <button
          onClick={() => navigate('/admin/veterinarios')}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-left shadow-sm transition hover:bg-amber-100"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-amber-600 shadow-sm">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-amber-900">
              {pendentes} veterinário{pendentes !== 1 ? 's' : ''} aguardando aprovação
            </span>
            <span className="block text-xs text-amber-700">Revisar credenciamento agora</span>
          </span>
        </button>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {metricas.map((m) => (
          <div key={m.rotulo} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{m.rotulo}</span>
              <m.icone className={`h-4 w-4 ${m.vivo ? 'text-teal-500' : 'text-slate-300'}`} />
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-black tabular-nums text-slate-900">{m.valor}</span>
              {m.vivo && <span className="h-2 w-2 animate-pulse rounded-full bg-teal-500" />}
            </div>
            {m.nota && <span className="text-[11px] text-slate-400">{m.nota}</span>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Atendimentos */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-sky-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Atendimentos</span>
          </div>
          <div className="mt-3 divide-y divide-slate-100 text-sm">
            {[
              ['Total', stats?.atendimentos?.total || 0, 'text-slate-900'],
              ['Finalizados', stats?.atendimentos?.finalizados || 0, 'text-emerald-600'],
              ['Em andamento', stats?.atendimentos?.em_andamento || 0, 'text-amber-600'],
            ].map(([rotulo, valor, cor]) => (
              <div key={rotulo} className="flex items-center justify-between py-2.5">
                <span className="text-xs font-medium text-slate-500">{rotulo}</span>
                <span className={`font-black tabular-nums ${cor}`}>{valor}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Satisfação */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Satisfação</span>
          </div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div>
              <p className="text-4xl font-black leading-none tabular-nums text-slate-900">{media.toFixed(1)}</p>
              <p className="mt-1 text-[11px] text-slate-400">
                {totalAvaliacoes} avaliaç{totalAvaliacoes === 1 ? 'ão' : 'ões'} recebida{totalAvaliacoes !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-0.5 pb-1" aria-label={`Média ${media.toFixed(1)} de 5`}>
              {[1, 2, 3, 4, 5].map((posicao) => (
                <Star key={posicao} className={`h-4 w-4 ${posicao <= Math.round(media) ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />
              ))}
            </div>
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-amber-400" style={{ width: `${(media / 5) * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  )
}
