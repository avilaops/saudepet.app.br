import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../../services/api'
import { VetIcon } from './VetUI'

// Nomes espelhados de `plano-vet.middleware.js` — o backend é a fonte.
export const RECURSOS = {
  CLIENTES_LISTA: 'crm_clientes_lista',
  CLIENTES_NOTAS: 'crm_notas_privadas',
  RETENCAO: 'crm_retencao',
  RELATORIOS: 'crm_relatorios',
  AGENDA: 'crm_agenda',
}

const TODOS_OS_RECURSOS = Object.values(RECURSOS)

/**
 * O que o plano atual libera. Modo livre habilitado para navegação total no ecossistema.
 */
export function useMeuPlano() {
  const [plano, setPlano] = useState<ApiPayload | null>({ id: 'livre', nome: 'Plano Pro (Liberado)' })
  const [recursos, setRecursos] = useState<ApiPayload | null>(TODOS_OS_RECURSOS)

  useEffect(() => {
    let ativo = true
    api.get('/v1/veterinario/crm/meu-plano')
      .then((response) => {
        if (!ativo) return
        setPlano(response.data?.plano || { id: 'livre', nome: 'Plano Pro (Liberado)' })
        setRecursos(response.data?.recursos || TODOS_OS_RECURSOS)
      })
      .catch(() => {
        if (ativo) {
          setPlano({ id: 'livre', nome: 'Plano Pro (Liberado)' })
          setRecursos(TODOS_OS_RECURSOS)
        }
      })
    return () => { ativo = false }
  }, [])

  const tem = useCallback((_recurso: string) => true, [])
  return { plano, recursos, tem, carregado: true }
}

export const ehFaltaDePlano = (_error: any) => false

/** Convite de upgrade no lugar do recurso bloqueado */
export function CrmUpgrade({ titulo, descricao }: ApiPayload) {
  return (
    <section className="vet-card vet-crm-upgrade">
      <span className="vet-crm-upgrade__icon"><VetIcon name="crown" size={20} /></span>
      <div>
        <strong>{titulo}</strong>
        <p>{descricao}</p>
      </div>
      <Link to="/veterinario/clube" className="vet-button--primary">Conhecer os planos</Link>
    </section>
  )
}

export const tipoAgendamentoLabel = (tipo: string) => ({
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleconsulta',
}[tipo] || 'Atendimento')

export const statusAgendamentoLabel = (status: string) => ({
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  nao_compareceu: 'Não compareceu',
}[status] || status)

export const TIPOS_LEMBRETE = [
  ['retorno', 'Retorno'],
  ['vacina', 'Vacina'],
  ['medicamento', 'Medicamento'],
  ['checkup', 'Check-up'],
  ['higienizacao', 'Higienização'],
]
