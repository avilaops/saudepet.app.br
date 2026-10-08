import { dataDeCalendario } from '../../lib/datas'
import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { Eyebrow } from '../ui/AppKit'

/**
 * Ficha de saúde declarada pelo tutor: alergias, medicamentos em uso e vacinas.
 *
 * Aparece dentro da edição do pet (precisa do id), grava direto na API e é o
 * que o veterinário lê antes de medicar. Remover é "sumir da lista": o
 * backend guarda o registro com quem removeu e quando.
 */

type Registro = Record<string, any>
type Ficha = { alergias: Registro[]; medicamentos: Registro[]; vacinas: Registro[] }

const CAMPO = 'mt-1 w-full rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3 py-2 text-[0.78rem] text-ink outline-none transition focus:border-primary'
const BOTAO_ADD = 'rounded-xl bg-primary/10 px-3 py-2 text-[0.75rem] font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50'
const BOTAO_REMOVER = 'text-[0.7rem] font-semibold text-red-500 hover:underline'

const dataBr = (valor?: string | null) => (valor ? dataDeCalendario(valor) : null)

const mensagemDoErro = (erro: any, padrao: string) =>
  erro?.response?.data?.details?.[0]?.message || erro?.response?.data?.error || padrao

export default function FichaSaudePet({ petId }: { petId: string }) {
  const [ficha, setFicha] = useState<Ficha>({ alergias: [], medicamentos: [], vacinas: [] })
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState('')

  const [alergia, setAlergia] = useState({ alergia: '', gravidade: 'moderada' })
  const [medicamento, setMedicamento] = useState({ nome_medicamento: '', dosagem: '', frequencia_horas: '24', uso_continuo: false })
  const [vacina, setVacina] = useState({ nome_vacina: '', data_aplicacao: '', proxima_dose: '' })

  const carregar = useCallback(async () => {
    try {
      const { data } = await api.get(`/pets/${petId}/ficha`)
      setFicha({ alergias: data.alergias || [], medicamentos: data.medicamentos || [], vacinas: data.vacinas || [] })
    } catch (e: any) {
      setErro(mensagemDoErro(e, 'Não foi possível carregar a ficha de saúde.'))
    } finally {
      setCarregando(false)
    }
  }, [petId])

  useEffect(() => { carregar() }, [carregar])

  const adicionar = async (tipo: 'alergias' | 'medicamentos' | 'vacinas', corpo: Registro, limpar: () => void) => {
    setErro('')
    setSalvando(tipo)
    try {
      await api.post(`/pets/${petId}/ficha/${tipo}`, corpo)
      limpar()
      await carregar()
    } catch (e: any) {
      setErro(mensagemDoErro(e, 'Não foi possível salvar.'))
    } finally {
      setSalvando('')
    }
  }

  const remover = async (tipo: 'alergias' | 'medicamentos' | 'vacinas', id: string) => {
    setErro('')
    try {
      await api.delete(`/pets/${petId}/ficha/${tipo}/${id}`)
      await carregar()
    } catch (e: any) {
      setErro(mensagemDoErro(e, 'Não foi possível remover.'))
    }
  }

  if (carregando) {
    return <p className="mt-4 text-[0.75rem] text-slate-400">Carregando ficha de saúde…</p>
  }

  return (
    <div className="mt-4 space-y-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-3.5">
      <div>
        <Eyebrow className="text-slate-500">Ficha de saúde</Eyebrow>
        <p className="text-[0.72rem] text-slate-400">O que o veterinário lê antes de medicar. Adicione o que você já sabe.</p>
      </div>

      {erro && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[0.75rem] font-semibold text-red-600" role="alert">{erro}</p>
      )}

      {/* Alergias */}
      <section>
        <h4 className="text-[0.78rem] font-semibold text-ink">Alergias</h4>
        <ul className="mt-1.5 space-y-1">
          {ficha.alergias.length === 0 && <li className="text-[0.72rem] text-slate-400">Nenhuma alergia declarada.</li>}
          {ficha.alergias.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-[0.75rem]">
              <span><strong>{item.alergia}</strong> · {item.gravidade}</span>
              <button type="button" className={BOTAO_REMOVER} onClick={() => remover('alergias', item.id)}>Remover</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-[1fr_auto_auto] gap-2">
          <input className={CAMPO} placeholder="Ex.: Dipirona, frango" value={alergia.alergia} maxLength={120}
            onChange={(e) => setAlergia({ ...alergia, alergia: e.target.value })} />
          <select className={CAMPO} value={alergia.gravidade} onChange={(e) => setAlergia({ ...alergia, gravidade: e.target.value })}>
            <option value="leve">Leve</option>
            <option value="moderada">Moderada</option>
            <option value="grave">Grave</option>
          </select>
          <button type="button" className={`${BOTAO_ADD} mt-1`} disabled={salvando === 'alergias' || alergia.alergia.trim().length < 2}
            onClick={() => adicionar('alergias', alergia, () => setAlergia({ alergia: '', gravidade: 'moderada' }))}>
            Adicionar
          </button>
        </div>
      </section>

      {/* Medicamentos */}
      <section>
        <h4 className="text-[0.78rem] font-semibold text-ink">Medicamentos em uso</h4>
        <ul className="mt-1.5 space-y-1">
          {ficha.medicamentos.length === 0 && <li className="text-[0.72rem] text-slate-400">Nenhum medicamento em uso.</li>}
          {ficha.medicamentos.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-[0.75rem]">
              <span>
                <strong>{item.nome_medicamento}</strong> · {item.dosagem} a cada {item.frequencia_horas}h
                {item.uso_continuo ? ' · contínuo' : ''}
              </span>
              <button type="button" className={BOTAO_REMOVER} onClick={() => remover('medicamentos', item.id)}>Remover</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_auto_auto]">
          <input className={CAMPO} placeholder="Medicamento" value={medicamento.nome_medicamento} maxLength={120}
            onChange={(e) => setMedicamento({ ...medicamento, nome_medicamento: e.target.value })} />
          <input className={CAMPO} placeholder="Dose (ex.: 10mg)" value={medicamento.dosagem} maxLength={60}
            onChange={(e) => setMedicamento({ ...medicamento, dosagem: e.target.value })} />
          <label className="text-[0.7rem] text-slate-500">
            A cada (h)
            <input type="number" min={1} max={720} className={CAMPO} value={medicamento.frequencia_horas}
              onChange={(e) => setMedicamento({ ...medicamento, frequencia_horas: e.target.value })} />
          </label>
          <label className="flex items-center gap-1.5 self-end pb-2 text-[0.72rem] text-slate-500">
            <input type="checkbox" checked={medicamento.uso_continuo}
              onChange={(e) => setMedicamento({ ...medicamento, uso_continuo: e.target.checked })} />
            Uso contínuo
          </label>
        </div>
        <button type="button" className={`${BOTAO_ADD} mt-2`}
          disabled={salvando === 'medicamentos' || medicamento.nome_medicamento.trim().length < 2 || !medicamento.dosagem.trim()}
          onClick={() => adicionar('medicamentos', medicamento, () => setMedicamento({ nome_medicamento: '', dosagem: '', frequencia_horas: '24', uso_continuo: false }))}>
          Adicionar medicamento
        </button>
      </section>

      {/* Vacinas */}
      <section>
        <h4 className="text-[0.78rem] font-semibold text-ink">Vacinas</h4>
        <ul className="mt-1.5 space-y-1">
          {ficha.vacinas.length === 0 && <li className="text-[0.72rem] text-slate-400">Nenhuma vacina registrada.</li>}
          {ficha.vacinas.map((item) => (
            <li key={item.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-[0.75rem]">
              <span>
                <strong>{item.nome_vacina}</strong> · {dataBr(item.data_aplicacao)}
                {item.proxima_dose ? ` · próxima ${dataBr(item.proxima_dose)}` : ''}
              </span>
              <button type="button" className={BOTAO_REMOVER} onClick={() => remover('vacinas', item.id)}>Remover</button>
            </li>
          ))}
        </ul>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
          <input className={CAMPO} placeholder="Ex.: V10, antirrábica" value={vacina.nome_vacina} maxLength={120}
            onChange={(e) => setVacina({ ...vacina, nome_vacina: e.target.value })} />
          <label className="text-[0.7rem] text-slate-500">
            Aplicada em
            <input type="date" className={CAMPO} value={vacina.data_aplicacao} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setVacina({ ...vacina, data_aplicacao: e.target.value })} />
          </label>
          <label className="text-[0.7rem] text-slate-500">
            Próxima dose
            <input type="date" className={CAMPO} value={vacina.proxima_dose}
              onChange={(e) => setVacina({ ...vacina, proxima_dose: e.target.value })} />
          </label>
          <button type="button" className={`${BOTAO_ADD} self-end mb-0.5`}
            disabled={salvando === 'vacinas' || vacina.nome_vacina.trim().length < 2 || !vacina.data_aplicacao}
            onClick={() => adicionar('vacinas', { ...vacina, proxima_dose: vacina.proxima_dose || undefined }, () => setVacina({ nome_vacina: '', data_aplicacao: '', proxima_dose: '' }))}>
            Adicionar
          </button>
        </div>
      </section>
    </div>
  )
}
