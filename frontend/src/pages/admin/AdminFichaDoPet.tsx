import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import VetHistoricoClinico from '../../components/veterinario/VetHistoricoClinico'

/**
 * A ficha clínica do pet, para o admin.
 *
 * A API sempre deixou o admin corrigir, remover e restaurar alergia, vacina e
 * medicamento em uso — ele responde pela ficha quando o veterinário que
 * registrou não está mais na plataforma — mas a única tela que fazia isso era
 * a do veterinário, dentro de um atendimento dele. Um registro errado deixado
 * por um profissional descredenciado ficava sem ninguém capaz de consertar.
 *
 * É o mesmo componente da tela do veterinário, de propósito: corrigir exige
 * motivo, remover exige motivo, e o que foi removido continua consultável. Uma
 * segunda tela teria de repetir essas regras e um dia divergiria.
 */
export default function AdminFichaDoPet() {
  const { id } = useParams()
  const navigate = useNavigate()

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <button
        type="button"
        onClick={() => navigate('/admin/atendimentos')}
        className="mb-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
      >
        <ArrowLeft size={14} /> Atendimentos
      </button>
      <h1 className="text-xl font-extrabold text-slate-800">Ficha clínica do pet</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Alergias, vacinas, medicamentos em uso e atendimentos anteriores do pet deste atendimento. Toda correção ou
        remoção pede motivo e fica registrada com o seu nome.
      </p>
      {/* `.vet-app` é onde vivem as cores e medidas do componente. */}
      <div className="vet-app vet-app--embutido">
        <VetHistoricoClinico atendimentoId={id} aberto />
      </div>
    </div>
  )
}
