import type { ApiPayload } from '../../types/api'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { ClipboardList, Loader2, Star } from 'lucide-react'
import api from '../../services/api'

const STATUS: Record<string, { texto: string; cls: string }> = {
  finalizado: { texto: 'Finalizado', cls: 'bg-emerald-100 text-emerald-700' },
  concluido: { texto: 'Finalizado', cls: 'bg-emerald-100 text-emerald-700' },
  cancelado: { texto: 'Cancelado', cls: 'bg-red-100 text-red-700' },
  procurando_veterinario: { texto: 'Procurando', cls: 'bg-amber-100 text-amber-700' },
  veterinario_encontrado: { texto: 'Encontrado', cls: 'bg-sky-100 text-sky-700' },
  a_caminho: { texto: 'A caminho', cls: 'bg-violet-100 text-violet-700' },
  chegou: { texto: 'Chegou', cls: 'bg-violet-100 text-violet-700' },
  atendimento_em_andamento: { texto: 'Em andamento', cls: 'bg-teal-100 text-teal-700' },
  encaminhado: { texto: 'Encaminhado à emergência', cls: 'bg-red-100 text-red-700' },
}

const TIPO: Record<string, string> = {
  emergencia: '🚨 Emergência',
  consulta_domiciliar: '🏠 Consulta domiciliar',
  teleorientacao: '📱 Teleorientação',
}

const FILTROS = [
  ['', 'Todos'],
  ['finalizado', 'Finalizados'],
  ['atendimento_em_andamento', 'Em andamento'],
  ['cancelado', 'Cancelados'],
]

export default function AdminAtendimentos() {
  const navigate = useNavigate()
  const [atendimentos, setAtendimentos] = useState<ApiPayload[]>([])
  const [filtro, setFiltro] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.get(`/admin/atendimentos${filtro ? `?status=${filtro}` : ''}`)
      .then((response) => setAtendimentos(response.data))
      .catch((error) => console.error('Erro ao carregar atendimentos:', error))
      .finally(() => setLoading(false))
  }, [filtro])

  return (
    // Coluna estreita de propósito: lista de atendimentos é leitura em coluna.
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-5 w-5 text-sky-600" />
          <span className="text-xs font-extrabold uppercase tracking-wider text-sky-600">Operação</span>
        </div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Atendimentos</h1>
        <p className="mt-0.5 text-xs text-slate-500">{atendimentos.length} atendimento(s) na visão atual</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(([valor, rotulo]) => (
          <button
            key={valor}
            onClick={() => setFiltro(valor)}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${filtro === valor ? 'bg-slate-900 text-white shadow' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs font-bold text-slate-400 shadow-sm">
          <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" /> Carregando…
        </div>
      ) : atendimentos.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <ClipboardList className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-xs font-bold text-slate-400">Nenhum atendimento encontrado nesta visão.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {atendimentos.map((atendimento) => {
            const st = STATUS[atendimento.status] || { texto: atendimento.status, cls: 'bg-slate-100 text-slate-500' }
            return (
              <div key={atendimento.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-slate-900">
                      {atendimento.pet?.nome || 'Pet'}
                      <span className="ml-2 text-xs font-medium text-slate-500">{TIPO[atendimento.tipo_atendimento] || 'Atendimento'}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Tutor: <span className="font-semibold text-slate-700">{atendimento.tutor?.nome}</span>
                      {atendimento.veterinario?.usuario?.nome && (
                        <> · Vet: <span className="font-semibold text-slate-700">{atendimento.veterinario.usuario.nome}</span></>
                      )}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Criado {new Date(atendimento.criado_em).toLocaleString('pt-BR')}
                      {atendimento.finalizado_em && <> · Finalizado {new Date(atendimento.finalizado_em).toLocaleString('pt-BR')}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${st.cls}`}>{st.texto}</span>
                    <button
                      onClick={() => navigate(`/admin/atendimentos/${atendimento.id}/auditoria`)}
                      className="rounded-xl bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600 transition hover:bg-slate-200"
                    >
                      Auditoria
                    </button>
                  </div>
                </div>

                {atendimento.avaliacao && (
                  <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-2.5">
                    <span className="flex items-center gap-1 text-xs font-bold text-amber-800">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star key={n} className={`h-3.5 w-3.5 ${n <= atendimento.avaliacao.nota ? 'fill-amber-400 text-amber-400' : 'text-amber-200'}`} />
                      ))}
                    </span>
                    {atendimento.avaliacao.comentario && (
                      <p className="mt-1 text-xs text-slate-600">“{atendimento.avaliacao.comentario}”</p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
