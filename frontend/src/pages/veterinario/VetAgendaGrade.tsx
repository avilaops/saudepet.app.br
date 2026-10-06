import { useNavigate } from 'react-router-dom'
import GradeSemanalEditor from '../../components/veterinario/GradeSemanalEditor'
import { VetPageHeader } from '../../components/veterinario/VetUI'

export default function VetAgendaGrade() {
  const navigate = useNavigate()
  return (
    <main className="vet-app">
      <VetPageHeader compact title="Disponibilidade semanal" subtitle="A grade que abastece sua agenda" onBack={() => navigate('/veterinario/horarios-valores')} />
      <div className="vet-app-main">
        <div className="vet-policy"><strong>Como a grade funciona</strong>Os horários livres oferecidos ao tutor saem dos dias e faixas definidos aqui.</div>
        <GradeSemanalEditor />
      </div>
    </main>
  )
}
