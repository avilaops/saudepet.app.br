import { useNavigate, useParams } from 'react-router-dom'
import VetHistoricoClinico from '../../components/veterinario/VetHistoricoClinico'
import { VetIcon, VetPageHeader } from '../../components/veterinario/VetUI'

/**
 * O histórico do pet fora do fechamento: o veterinário precisa dele a caminho e
 * durante o atendimento, não só na hora de escrever o prontuário.
 */
export default function VetHistoricoPet() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <main className="vet-app">
      <VetPageHeader compact title="Histórico clínico do pet" onBack={() => navigate(`/veterinario/atendimento/${id}`)} />
      <div className="vet-record">
        <VetHistoricoClinico atendimentoId={id} aberto />
        <button type="button" className="vet-record-add" onClick={() => navigate(`/veterinario/atendimento/${id}/prontuario`)}>
          <VetIcon name="document" size={16} /> Ir para o prontuário deste atendimento
        </button>
      </div>
    </main>
  )
}
