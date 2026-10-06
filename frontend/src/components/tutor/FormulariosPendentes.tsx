import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Icon } from '../ui/AppKit'

// Tipos que fazem sentido pedir ao tutor antes/durante o atendimento.
const TIPOS_DO_TUTOR = ['pre_consulta', 'anamnese', 'termo_consentimento']

/**
 * Formulários ativos que o tutor ainda não respondeu para este atendimento.
 * Termo de consentimento vale uma vez por tutor; anamnese e pré-consulta
 * valem por atendimento. Sem pendência, não renderiza nada.
 */
export default function FormulariosPendentes({ atendimentoId, petId }: ApiPayload) {
  const navigate = useNavigate()
  const [pendentes, setPendentes] = useState<ApiPayload[]>([])

  useEffect(() => {
    if (!atendimentoId) return
    Promise.all([
      api.get('/formularios', { params: { status: 'ativo', limit: 50 } }),
      api.get('/formularios/minhas-respostas', { params: { limit: 100 } })
    ])
      .then(([formsRes, respostasRes]) => {
        const forms = (formsRes.data.formularios || []).filter((f: ApiPayload) => TIPOS_DO_TUTOR.includes(f.tipo))
        const respostas = respostasRes.data.respostas || []
        setPendentes(forms.filter((form: ApiPayload) => {
          if (form.tipo === 'termo_consentimento') {
            return !respostas.some((r: ApiPayload) => r.formulario_id === form.id)
          }
          return !respostas.some((r: ApiPayload) => r.formulario_id === form.id && r.atendimento_id === atendimentoId)
        }))
      })
      .catch(() => {})
  }, [atendimentoId])

  if (!pendentes.length) return null

  return (
    <div className="mb-6 space-y-2">
      {pendentes.map((form) => (
        <button
          key={form.id}
          onClick={() => navigate(`/formularios/${form.id}/responder?atendimento=${atendimentoId}${petId ? `&pet=${petId}` : ''}`)}
          className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left transition hover:bg-amber-100"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-amber-600 shadow-sm">
            <Icon name="clipboard" size={17} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[0.8rem] font-semibold text-amber-900">{form.titulo}</span>
            <span className="block text-[0.7rem] text-amber-700">
              {form.obrigatorio ? 'Preenchimento obrigatório' : 'Ajuda o veterinário a se preparar'} — toque para responder
            </span>
          </span>
          <Icon name="chevron" size={16} className="shrink-0 text-amber-400" />
        </button>
      ))}
    </div>
  )
}
