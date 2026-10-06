import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { VetIcon } from './VetUI'

/**
 * O que saiu da ficha, e o caminho de volta.
 *
 * Remover um registro clínico sempre foi lógico: a linha fica no banco, some
 * das leituras, carrega quem removeu e por quê. Faltava a volta — reativar algo
 * tirado por engano exigia acesso ao banco.
 *
 * E isso importa mais do que parece: uma alergia removida por engano é uma
 * alergia que não aparece na hora de medicar.
 *
 * A lista fica fechada por padrão. Quem abre a ficha quer ver o que vale hoje;
 * o que foi removido é consulta, não conteúdo.
 */

type Registro = {
  id: string
  removido_em: string | null
  motivo_remocao: string | null
  alergia?: string
  nome_vacina?: string
  nome_medicamento?: string
}

type Removidos = {
  alergias: Registro[]
  vacinas: Registro[]
  medicamentos: Registro[]
}

const GRUPOS = [
  { chave: 'alergias' as const, rotulo: 'Alergia', recurso: 'alergias', campo: 'alergia' as const },
  { chave: 'vacinas' as const, rotulo: 'Vacina', recurso: 'vacinas', campo: 'nome_vacina' as const },
  { chave: 'medicamentos' as const, rotulo: 'Medicamento', recurso: 'medicamentos', campo: 'nome_medicamento' as const }
]

const dataCurta = (valor: string | null) =>
  valor ? new Date(valor).toLocaleDateString('pt-BR') : ''

export default function RegistrosRemovidos({ petId }: { petId: string }) {
  const [removidos, setRemovidos] = useState<Removidos | null>(null)
  const [aberto, setAberto] = useState(false)
  const [restaurando, setRestaurando] = useState<string | null>(null)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/v1/pets/${petId}/removidos`)
      setRemovidos(data)
    } catch {
      setRemovidos(null)
    }
  }, [petId])

  useEffect(() => { carregar() }, [carregar])

  const total = removidos
    ? removidos.alergias.length + removidos.vacinas.length + removidos.medicamentos.length
    : 0

  if (!total) return null

  const restaurar = async (recurso: string, registro: Registro, rotulo: string) => {
    // O motivo é exigido pela mesma razão da remoção: numa ficha clínica,
    // nenhuma alteração acontece sem alguém assumir por quê.
    const motivo = window.prompt(`Por que este registro deve voltar à ficha?`)?.trim()
    if (!motivo || motivo.length < 5) {
      if (motivo !== undefined) setAviso('Escreva o motivo (pelo menos cinco letras).')
      return
    }

    setRestaurando(registro.id)
    setAviso('')
    try {
      await api.post(`/v1/pets/${petId}/${recurso}/${registro.id}/restaurar`, { motivo })
      setAviso(`${rotulo} voltou para a ficha.`)
      await carregar()
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response
      setAviso(resposta?.data?.error || 'Não foi possível restaurar agora.')
    } finally {
      setRestaurando(null)
    }
  }

  return (
    <section className="vet-card vet-section-card">
      <button
        type="button"
        className="vet-removidos__cabecalho"
        onClick={() => setAberto(!aberto)}
        aria-expanded={aberto}
      >
        <VetIcon name="folder" size={17} />
        <span>{total} {total === 1 ? 'registro removido' : 'registros removidos'} desta ficha</span>
        <VetIcon name="chevron" size={15} className={aberto ? 'is-aberto' : ''} />
      </button>

      {aviso && <p className="vet-review-pending" role="status">{aviso}</p>}

      {aberto && (
        <div className="vet-removidos__lista">
          {GRUPOS.map((grupo) => (
            removidos?.[grupo.chave].map((registro) => (
              <div key={registro.id} className="vet-removidos__item">
                <div>
                  <strong>{registro[grupo.campo] || grupo.rotulo}</strong>
                  <small>
                    {grupo.rotulo} · removida em {dataCurta(registro.removido_em)}
                    {registro.motivo_remocao ? ` — “${registro.motivo_remocao}”` : ''}
                  </small>
                </div>
                <button
                  type="button"
                  disabled={restaurando === registro.id}
                  onClick={() => restaurar(grupo.recurso, registro, grupo.rotulo)}
                >
                  {restaurando === registro.id ? 'Restaurando…' : 'Restaurar'}
                </button>
              </div>
            ))
          ))}
        </div>
      )}
    </section>
  )
}
