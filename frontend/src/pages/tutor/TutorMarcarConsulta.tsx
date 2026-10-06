import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Eyebrow, PageHeader, Panel } from '../../components/ui/AppKit'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import EscolherProfissional from '../../components/tutor/EscolherProfissional'

/**
 * Marcar consulta futura.
 *
 * A agenda existia inteira do lado do profissional — grade semanal, conflito,
 * remarcação — e o tutor só podia confirmar ou cancelar o que o veterinário
 * criasse. Para marcar um check-up, ele precisava ligar.
 *
 * Aqui ele escolhe o tipo, o pet, o profissional, o dia e um horário livre. O
 * compromisso nasce pendente: quem escolhe o horário é o tutor, quem confirma
 * que vai é o profissional.
 */

const TIPOS = [
  { valor: 'consulta_rotina', titulo: 'Consulta de rotina', texto: 'Check-up ou acompanhamento.' },
  { valor: 'vacinacao', titulo: 'Vacinação', texto: 'Aplicação em casa, lançada na carteira.' },
  { valor: 'avaliacao', titulo: 'Avaliação clínica', texto: 'Exame clínico sem urgência.' }
]

type Pet = { id: string; nome: string }

/** Amanhã — marcar para hoje raramente é agenda, é urgência. */
function amanha(): string {
  const data = new Date()
  data.setDate(data.getDate() + 1)
  return data.toISOString().slice(0, 10)
}

export default function TutorMarcarConsulta() {
  const navigate = useNavigate()

  const [pets, setPets] = useState<Pet[]>([])
  const [tipo, setTipo] = useState('consulta_rotina')
  const [pet, setPet] = useState('')
  const [profissional, setProfissional] = useState<string | null>(null)
  const [precoProfissional, setPrecoProfissional] = useState<number | null>(null)
  const [dia, setDia] = useState(amanha())
  const [horarios, setHorarios] = useState<string[]>([])
  const [horario, setHorario] = useState('')
  const [buscandoHorarios, setBuscandoHorarios] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    api.get('/pets')
      .then(({ data }) => {
        const lista: Pet[] = Array.isArray(data?.pets) ? data.pets : []
        setPets(lista)
        if (lista[0]) setPet(lista[0].id)
      })
      .catch(() => setPets([]))
  }, [])

  // Os horários dependem do profissional e do dia — sem os dois não há o que
  // perguntar, e perguntar cedo demais devolveria a grade de ninguém.
  useEffect(() => {
    if (!profissional || !dia) {
      setHorarios([])
      return
    }
    let vigente = true
    setBuscandoHorarios(true)
    setHorario('')
    api.get('/v1/agenda/horarios-livres', { params: { veterinario_id: profissional, data: dia } })
      .then(({ data }) => { if (vigente) setHorarios(data.horarios || []) })
      .catch(() => { if (vigente) setHorarios([]) })
      .finally(() => { if (vigente) setBuscandoHorarios(false) })
    return () => { vigente = false }
  }, [profissional, dia])

  const marcar = async () => {
    if (!pet || !profissional || !horario) {
      setErro('Escolha o pet, o profissional e um horário.')
      return
    }

    setEnviando(true)
    setErro('')
    try {
      await api.post('/v1/agenda/marcar', {
        veterinario_id: profissional,
        pet_id: pet,
        tipo_atendimento: tipo,
        inicio: new Date(`${dia}T${horario}:00`).toISOString()
      })
      navigate('/tutor/agenda', {
        state: { aviso: 'Consulta marcada. O profissional vai confirmar.' }
      })
    } catch (falha: any) {
      const resposta = (falha as { response?: { data?: { error?: string } } }).response
      setErro(resposta?.data?.error || 'Não foi possível marcar agora.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader title="Marcar consulta" subtitle="Sem pressa, com hora escolhida" onBack={() => navigate('/tutor/agenda')} action={null} />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}

        <Panel className="space-y-3 px-4 py-4">
          <Eyebrow className="text-slate-400">Tipo</Eyebrow>
          <div className="space-y-2">
            {TIPOS.map((item) => (
              <label
                key={item.valor}
                className={`flex items-start gap-3 rounded-2xl border px-4 py-3 transition ${tipo === item.valor ? 'border-primary bg-primary/5' : 'border-slate-200'}`}
              >
                <input
                  type="radio"
                  name="tipo"
                  className="mt-1 h-4 w-4"
                  checked={tipo === item.valor}
                  onChange={() => {
                    setTipo(item.valor)
                    setProfissional(null)
                    setPrecoProfissional(null)
                  }}
                />
                <span>
                  <span className="block text-[0.85rem] font-semibold text-ink">{item.titulo}</span>
                  <span className="mt-0.5 block text-[0.72rem] text-slate-500">{item.texto}</span>
                </span>
              </label>
            ))}
          </div>

          {/* Emergência não aparece aqui de propósito: agendar socorro para
              quinta-feira não é recurso, é mal-entendido. */}
          <p className="text-[0.68rem] leading-relaxed text-slate-400">
            Precisa de atendimento agora? Use <strong>Chamar veterinário</strong> na tela inicial.
          </p>
        </Panel>

        <Panel className="space-y-3 px-4 py-4">
          <label className="block">
            <Eyebrow className="text-slate-400">Pet</Eyebrow>
            <select
              value={pet}
              onChange={(evento) => setPet(evento.target.value)}
              className="input mt-1.5 w-full text-[0.85rem]"
            >
              {pets.map((item) => (
                <option key={item.id} value={item.id}>{item.nome}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <Eyebrow className="text-slate-400">Dia</Eyebrow>
            <input
              type="date"
              value={dia}
              min={amanha()}
              onChange={(evento) => setDia(evento.target.value)}
              className="input mt-1.5 w-full text-[0.85rem]"
            />
          </label>
        </Panel>

        <Panel className="px-4 py-4">
          <EscolherProfissional
            tipo={tipo}
            latitude={null}
            longitude={null}
            escolhido={profissional}
            onEscolher={(id, preco) => {
              setProfissional(id)
              setPrecoProfissional(preco ?? null)
            }}
          />
        </Panel>

        {profissional && (
          <Panel className="px-4 py-4">
            <Eyebrow className="text-slate-400">Horário</Eyebrow>

            {buscandoHorarios ? (
              <p className="mt-2 text-[0.75rem] text-slate-400">Procurando horários…</p>
            ) : horarios.length === 0 ? (
              <p className="mt-2 text-[0.75rem] leading-relaxed text-slate-500">
                Nenhum horário livre neste dia com este profissional. Tente outro dia — ou outro
                profissional.
              </p>
            ) : (
              <div className="mt-2 grid grid-cols-4 gap-2">
                {horarios.map((hora) => (
                  <button
                    key={hora}
                    type="button"
                    onClick={() => setHorario(hora)}
                    className={`rounded-xl border py-2.5 text-[0.78rem] font-semibold transition ${horario === hora ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-600'}`}
                  >
                    {hora}
                  </button>
                ))}
              </div>
            )}
          </Panel>
        )}

        {profissional && precoProfissional != null && (
          <Panel className="flex items-center justify-between gap-4 px-4 py-4">
            <span>
              <Eyebrow className="text-slate-400">Valor do atendimento</Eyebrow>
              <span className="mt-1 block text-[0.7rem] leading-relaxed text-slate-500">
                Preço publicado pelo profissional no momento da marcação.
              </span>
            </span>
            <strong className="shrink-0 text-[1rem] text-primary">
              {precoProfissional.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </strong>
          </Panel>
        )}

        <button
          type="button"
          onClick={marcar}
          disabled={enviando || !horario}
          className="w-full rounded-2xl bg-primary px-4 py-3.5 text-[0.85rem] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {enviando ? 'Marcando…' : 'Marcar consulta'}
        </button>

        <p className="text-center text-[0.68rem] leading-relaxed text-slate-400">
          O profissional confirma antes de virar compromisso. Você recebe o aviso pelo app.
        </p>
      </div>

      <TutorBottomNav />
    </div>
  )
}
