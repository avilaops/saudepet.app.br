import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../services/api'
import { VetIcon, VetLoading } from './VetUI'

const DIAS_SEMANA = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
const GRADE_PADRAO = DIAS_SEMANA.map((_, idx) => ({
  dia_semana: idx,
  hora_inicio: '08:00',
  hora_fim: '18:00',
  ativo: idx > 0 && idx < 6,
}))

export default function GradeSemanalEditor() {
  const [grade, setGrade] = useState(GRADE_PADRAO)
  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [sucesso, setSucesso] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setErro('')
    try {
      const response = await api.get('/v1/agenda/minha-grade')
      const agendas = response.data?.agendas || []
      if (agendas.length > 0) {
        setGrade(DIAS_SEMANA.map((_, idx) => {
          const gravado = agendas.find((item: ApiPayload) => item.dia_semana === idx)
          return gravado
            ? { dia_semana: idx, hora_inicio: gravado.hora_inicio, hora_fim: gravado.hora_fim, ativo: gravado.ativo }
            : { dia_semana: idx, hora_inicio: '08:00', hora_fim: '18:00', ativo: false }
        }))
      }
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível carregar sua disponibilidade.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const mudar = (idx: number, mudanca: ApiPayload) => {
    setSucesso('')
    setGrade((atual) => atual.map((item, i) => (i === idx ? { ...item, ...mudanca } : item)))
  }
  const diaInvalido = useMemo(
    () => grade.find((item) => !item.hora_inicio || !item.hora_fim || item.hora_inicio >= item.hora_fim),
    [grade]
  )
  const diasAtivos = grade.filter((item) => item.ativo).length

  const salvar = async (event: React.FormEvent) => {
    event.preventDefault()
    if (diaInvalido) {
      setErro(`Em ${DIAS_SEMANA[diaInvalido.dia_semana].toLowerCase()}, o início precisa vir antes do fim.`)
      return
    }
    setSalvando(true)
    setErro('')
    setSucesso('')
    try {
      const response = await api.post('/v1/agenda/grade', { grade })
      setSucesso(response.data?.message || 'Disponibilidade atualizada.')
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || requestError.response?.data?.message || 'Não foi possível salvar os horários.')
    } finally {
      setSalvando(false)
    }
  }

  if (loading) return <VetLoading label="Carregando sua disponibilidade" />

  return (
    <section className="vet-card vet-catalog-section">
      <div className="vet-catalog-section__title">
        <span className="vet-setting-row__icon"><VetIcon name="clock" size={19} /></span>
        <div><h2>Horários de atendimento</h2><p>Defina quando o tutor pode encontrar horários livres.</p></div>
        <button className="vet-icon-button" type="button" onClick={carregar} aria-label="Recarregar horários"><VetIcon name="refresh" size={17} /></button>
      </div>
      {erro && <p className="vet-catalog-feedback is-error" role="alert">{erro}</p>}
      {sucesso && <p className="vet-catalog-feedback is-success" role="status">{sucesso}</p>}
      <form onSubmit={salvar}>
        <div className="vet-catalog-schedule">
          {grade.map((item, idx) => (
            <div className={`vet-catalog-day ${item.ativo ? '' : 'is-off'}`} key={item.dia_semana}>
              <div className="vet-catalog-day__name">
                <button type="button" className={`vet-switch ${item.ativo ? 'is-on' : ''}`} aria-pressed={item.ativo} aria-label={`${item.ativo ? 'Desativar' : 'Ativar'} ${DIAS_SEMANA[idx]}`} onClick={() => mudar(idx, { ativo: !item.ativo })} />
                <strong>{DIAS_SEMANA[idx].slice(0, 3)}</strong>
              </div>
              {item.ativo ? (
                <div className="vet-catalog-day__hours">
                  <input type="time" required aria-label={`Início em ${DIAS_SEMANA[idx]}`} value={item.hora_inicio} onChange={(event) => mudar(idx, { hora_inicio: event.target.value })} />
                  <span>até</span>
                  <input type="time" required aria-label={`Fim em ${DIAS_SEMANA[idx]}`} value={item.hora_fim} onChange={(event) => mudar(idx, { hora_fim: event.target.value })} />
                </div>
              ) : <span className="vet-catalog-day__unavailable">Indisponível</span>}
            </div>
          ))}
        </div>
        <button className="vet-catalog-save-secondary" type="submit" disabled={salvando || Boolean(diaInvalido)}>
          {salvando ? 'Salvando horários…' : `Salvar ${diasAtivos} ${diasAtivos === 1 ? 'dia disponível' : 'dias disponíveis'}`}
        </button>
      </form>
    </section>
  )
}
