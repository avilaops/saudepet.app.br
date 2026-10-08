import { dataDeCalendario, dataLocal } from '../../lib/datas'
import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { Badge, EmptyState, Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'

/**
 * Lembretes do pet.
 *
 * O veterinário já gravava aqui no fechamento do atendimento — retorno sugerido e
 * reforço de vacina —, mas o tutor não tinha por onde ver. Esta é a tela que
 * faltava para o lembrete sair do banco.
 */

const TIPOS = [
  { valor: 'retorno', rotulo: 'Retorno', icone: 'vet' },
  { valor: 'vacina', rotulo: 'Vacina', icone: 'shield' },
  { valor: 'medicamento', rotulo: 'Medicamento', icone: 'clipboard' },
  { valor: 'higienizacao', rotulo: 'Higiene', icone: 'spark' },
  { valor: 'outro', rotulo: 'Outro', icone: 'bell' }
]

const iconeDoTipo = (tipo: string) => TIPOS.find((item) => item.valor === tipo)?.icone || 'bell'
const formatarData = (valor: string) => dataDeCalendario(valor, { day: '2-digit', month: 'short' })

const hojeSemHora = () => {
  const data = new Date()
  data.setHours(0, 0, 0, 0)
  return data
}

export default function TutorLembretes() {
  const navigate = useNavigate()
  const [lembretes, setLembretes] = useState<ApiPayload[]>([])
  const [pets, setPets] = useState<ApiPayload[]>([])
  const [mostrarConcluidos, setMostrarConcluidos] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [formAberto, setFormAberto] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState<ApiPayload>({ pet_id: '', titulo: '', tipo: 'outro', data_lembrete: '' })

  const carregar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    try {
      const [lista, petsResponse] = await Promise.all([
        api.get(`/v1/lembretes${mostrarConcluidos ? '?concluidos=1' : ''}`),
        api.get('/v1/pets')
      ])
      setLembretes(lista.data.lembretes || [])
      setPets(petsResponse.data.pets || [])
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar seus lembretes.')
    } finally {
      setCarregando(false)
    }
  }, [mostrarConcluidos])

  useEffect(() => { carregar() }, [carregar])

  const alternarConclusao = async (lembrete: ApiPayload) => {
    try {
      const { data } = await api.put(`/v1/lembretes/${lembrete.id}/concluir`, { concluido: !lembrete.concluido })
      setLembretes((atuais) => mostrarConcluidos
        ? atuais.map((item) => item.id === lembrete.id ? data.lembrete : item)
        : atuais.filter((item) => item.id !== lembrete.id))
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível atualizar o lembrete.')
    }
  }

  const criar = async (event: any) => {
    event.preventDefault()
    setSalvando(true)
    setErro('')
    try {
      await api.post('/v1/lembretes', form)
      setForm({ pet_id: '', titulo: '', tipo: 'outro', data_lembrete: '' })
      setFormAberto(false)
      await carregar()
    } catch (requestError: any) {
      const resposta = requestError.response?.data
      setErro(resposta?.details?.map((item: ApiPayload) => item.message).join(' • ') || resposta?.error || 'Não foi possível criar o lembrete.')
    } finally {
      setSalvando(false)
    }
  }

  const hoje = hojeSemHora()
  const atrasados = lembretes.filter((item) => !item.concluido && dataLocal(item.data_lembrete) < hoje)
  const proximos = lembretes.filter((item) => !item.concluido && dataLocal(item.data_lembrete) >= hoje)
  const concluidos = lembretes.filter((item) => item.concluido)

  const cartao = (item: ApiPayload) => {
    const atrasado = !item.concluido && dataLocal(item.data_lembrete) < hoje
    return (
      <div key={item.id} className="flex items-center gap-3 px-4 py-3.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${
          item.concluido
            ? 'border-slate-200/80 bg-slate-50 text-slate-300'
            : atrasado
              ? 'border-red-200 bg-red-50 text-red-600'
              : 'border-slate-200/80 bg-slate-50 text-ink'
        }`}>
          <Icon name={iconeDoTipo(item.tipo)} size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[0.85rem] font-semibold ${item.concluido ? 'text-slate-300 line-through' : 'text-ink'}`}>
            {item.titulo}
          </p>
          <p className="mt-0.5 truncate text-[0.72rem] text-slate-400">
            {item.pet?.nome} · {formatarData(item.data_lembrete)}
          </p>
        </div>
        <button
          onClick={() => alternarConclusao(item)}
          className={`shrink-0 rounded-xl px-3 py-2 text-[0.72rem] font-semibold transition ${
            item.concluido
              ? 'border border-slate-200/80 text-slate-500 hover:bg-slate-50'
              : 'bg-primary/10 text-primary hover:bg-primary/20'
          }`}
        >
          {item.concluido ? 'Reabrir' : 'Concluir'}
        </button>
      </div>
    )
  }

  const grupo = (titulo: string, itens: ApiPayload[], tom?: string) => itens.length > 0 && (
    <section className="space-y-2">
      <div className="flex items-center gap-2 px-1">
        <Eyebrow className={tom === 'red' ? 'text-red-500' : 'text-slate-400'}>{titulo}</Eyebrow>
        <Badge tone={tom === 'red' ? 'red' : 'slate'}>{itens.length}</Badge>
      </div>
      <Panel className="divide-y divide-slate-100 overflow-hidden">{itens.map(cartao)}</Panel>
    </section>
  )

  return (
    <div className="container-app bg-surface-page pb-24">
      <PageHeader
        title="Lembretes"
        subtitle="Retornos, vacinas e cuidados dos seus pets"
        onBack={() => navigate('/tutor/home')}
      />

      <div className="space-y-4 px-5 pb-6 pt-5">
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => setFormAberto((aberto) => !aberto)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-primary px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#127e82]"
          >
            <Icon name={formAberto ? 'chevron' : 'plus'} size={15} className={formAberto ? '-rotate-90' : ''} />
            {formAberto ? 'Cancelar' : 'Novo lembrete'}
          </button>
          <button
            onClick={() => setMostrarConcluidos((atual) => !atual)}
            className="rounded-2xl border border-slate-200/80 bg-white px-4 py-3 text-[0.8rem] font-semibold text-slate-500 transition hover:bg-slate-50"
          >
            {mostrarConcluidos ? 'Só pendentes' : 'Concluídos'}
          </button>
        </div>

        {formAberto && (
          <Panel as="form" className="space-y-3 px-4 py-4" onSubmit={criar}>
            <label className="block">
              <Eyebrow className="text-slate-400">Pet</Eyebrow>
              <select
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                value={form.pet_id}
                onChange={(event) => setForm({ ...form, pet_id: event.target.value })}
                required
              >
                <option value="">Selecione</option>
                {pets.map((pet) => <option key={pet.id} value={pet.id}>{pet.nome}</option>)}
              </select>
            </label>

            <label className="block">
              <Eyebrow className="text-slate-400">Lembrete</Eyebrow>
              <input
                className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                value={form.titulo}
                maxLength={120}
                placeholder="Dar vermífugo, banho, consulta…"
                onChange={(event) => setForm({ ...form, titulo: event.target.value })}
                required
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <Eyebrow className="text-slate-400">Tipo</Eyebrow>
                <select
                  className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                  value={form.tipo}
                  onChange={(event) => setForm({ ...form, tipo: event.target.value })}
                >
                  {TIPOS.map((tipo) => <option key={tipo.valor} value={tipo.valor}>{tipo.rotulo}</option>)}
                </select>
              </label>

              <label className="block">
                <Eyebrow className="text-slate-400">Data</Eyebrow>
                <input
                  className="mt-1.5 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] text-ink outline-none transition focus:border-primary"
                  type="date"
                  value={form.data_lembrete}
                  onChange={(event) => setForm({ ...form, data_lembrete: event.target.value })}
                  required
                />
              </label>
            </div>

            <button
              className="w-full rounded-xl bg-ink px-4 py-3 text-[0.8rem] font-semibold text-white transition hover:bg-[#0e262b] disabled:opacity-50"
              type="submit"
              disabled={salvando}
            >
              {salvando ? 'Salvando…' : 'Criar lembrete'}
            </button>
          </Panel>
        )}

        {carregando ? (
          <div className="py-14 text-center">
            <div className="mx-auto h-7 w-7 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
          </div>
        ) : lembretes.length === 0 ? (
          <EmptyState
            icon="bell"
            title="Nenhum lembrete por aqui"
            description="Os retornos e reforços de vacina indicados pelo veterinário aparecem nesta tela sozinhos."
          />
        ) : (
          <>
            {grupo('Atrasados', atrasados, 'red')}
            {grupo('Próximos', proximos)}
            {mostrarConcluidos && grupo('Concluídos', concluidos)}
          </>
        )}
      </div>

      <TutorBottomNav />
    </div>
  )
}
