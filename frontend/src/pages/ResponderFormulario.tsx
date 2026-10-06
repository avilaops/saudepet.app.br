import type { ApiPayload } from '../types/api'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { Icon, PageHeader, Panel } from '../components/ui/AppKit'

export default function ResponderFormulario() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const atendimentoId = params.get('atendimento') || undefined
  const petId = params.get('pet') || undefined

  const [formulario, setFormulario] = useState<ApiPayload | null>(null)
  const [respostas, setRespostas] = useState<ApiPayload>({})
  const [erro, setErro] = useState<string | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [enviandoArquivo, setEnviandoArquivo] = useState('')

  useEffect(() => {
    api.get(`/formularios/${id}`)
      .then((r: any) => {
        const form = r.data.formulario || r.data
        setFormulario({
          ...form,
          campos: typeof form.campos === 'string'
            ? (() => { try { return JSON.parse(form.campos) } catch { return [] } })()
            : form.campos
        })
      })
      .catch(() => setErro('Formulário não encontrado ou inativo.'))
      .finally(() => setCarregando(false))
  }, [id])

  const definir = (campoId: any, valor: any) =>
    setRespostas((r: ApiPayload) => ({ ...r, [campoId]: valor }))

  const anexar = (campoId: any) => async (evento: any) => {
    const arquivo = evento.target.files?.[0]
    evento.target.value = ''
    if (!arquivo) return

    setErro(null)
    setEnviandoArquivo(campoId)
    try {
      const dados = new FormData()
      dados.append('arquivo', arquivo)
      const { data } = await api.post(`/formularios/${id}/anexo`, dados, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      definir(campoId, { url: data.url, nome: data.nome })
    } catch (requestError: any) {
      setErro(requestError.response?.data?.error || 'Não foi possível enviar o arquivo.')
    } finally {
      setEnviandoArquivo('')
    }
  }

  const alternarOpcao = (campoId: any, opcao: string) =>
    setRespostas((r: ApiPayload) => {
      const atual = Array.isArray(r[campoId]) ? r[campoId] : []
      return { ...r, [campoId]: atual.includes(opcao) ? atual.filter((o: string) => o !== opcao) : [...atual, opcao] }
    })

  const completo = formulario?.campos?.every((c: ApiPayload) => {
    if (!c.obrigatorio) return true
    const v = respostas[c.id]
    return Array.isArray(v) ? v.length > 0 : v !== undefined && String(v).trim() !== ''
  })

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      await api.post(`/formularios/${id}/responder`, {
        formulario_id: id,
        atendimento_id: atendimentoId,
        pet_id: petId,
        respostas
      })
      setEnviado(true)
      window.setTimeout(() => navigate(-1), 1800)
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível enviar as respostas.')
    } finally {
      setEnviando(false)
    }
  }

  if (carregando) {
    return (
      <div className="container-app flex min-h-screen items-center justify-center bg-surface-page">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-primary" />
      </div>
    )
  }

  if (!formulario) {
    return (
      <div className="container-app bg-surface-page pb-10">
        <PageHeader title="Formulário" onBack={() => navigate(-1)} />
        <div className="px-5 py-5">
          <Panel className="px-6 py-10 text-center">
            <p className="text-[0.85rem] font-semibold text-ink">{erro || 'Formulário indisponível.'}</p>
          </Panel>
        </div>
      </div>
    )
  }

  if (enviado) {
    return (
      <div className="container-app flex min-h-screen items-center justify-center bg-surface-page">
        <Panel className="mx-5 px-8 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
            <Icon name="check" size={24} />
          </span>
          <p className="mt-3 text-[0.95rem] font-semibold text-ink">Respostas enviadas!</p>
          <p className="mt-1 text-[0.75rem] text-slate-400">Obrigado — voltando…</p>
        </Panel>
      </div>
    )
  }

  const estiloCampo = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-[0.85rem] text-ink outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-50'

  return (
    <div className="container-app bg-surface-page pb-10">
      <PageHeader title={formulario.titulo} subtitle={formulario.descricao || undefined} onBack={() => navigate(-1)} />

      <div className="space-y-4 px-5 py-5">
        {formulario.campos?.map((campo: ApiPayload) => (
          <Panel key={campo.id} className="px-4 py-3.5">
            <label className="block">
              <span className="text-[0.8rem] font-semibold text-ink">
                {campo.label}
                {campo.obrigatorio && <span className="text-red-500"> *</span>}
              </span>

              {campo.tipo === 'texto' && (
                <input value={respostas[campo.id] || ''} onChange={(e) => definir(campo.id, e.target.value)} placeholder={campo.placeholder || ''} className={estiloCampo} />
              )}
              {campo.tipo === 'textarea' && (
                <textarea rows={3} value={respostas[campo.id] || ''} onChange={(e) => definir(campo.id, e.target.value)} placeholder={campo.placeholder || ''} className={estiloCampo} />
              )}
              {campo.tipo === 'numero' && (
                <input type="number" value={respostas[campo.id] ?? ''} onChange={(e) => definir(campo.id, e.target.value)} placeholder={campo.placeholder || ''} className={estiloCampo} />
              )}
              {campo.tipo === 'data' && (
                <input type="date" value={respostas[campo.id] || ''} onChange={(e) => definir(campo.id, e.target.value)} className={estiloCampo} />
              )}
              {campo.tipo === 'select' && (
                <select value={respostas[campo.id] || ''} onChange={(e) => definir(campo.id, e.target.value)} className={estiloCampo}>
                  <option value="">Selecione…</option>
                  {(campo.opcoes || []).map((o: ApiPayload) => <option key={o} value={o}>{o}</option>)}
                </select>
              )}
              {campo.tipo === 'radio' && (
                <div className="mt-2 space-y-2">
                  {(campo.opcoes || []).map((o: ApiPayload) => (
                    <label key={o} className="flex items-center gap-2.5 text-[0.82rem] text-slate-700">
                      <input type="radio" name={campo.id} checked={respostas[campo.id] === o} onChange={() => definir(campo.id, o)} className="accent-teal-600" />
                      {o}
                    </label>
                  ))}
                </div>
              )}
              {campo.tipo === 'checkbox' && (
                <div className="mt-2 space-y-2">
                  {(campo.opcoes || []).map((o: ApiPayload) => (
                    <label key={o} className="flex items-center gap-2.5 text-[0.82rem] text-slate-700">
                      <input type="checkbox" checked={Array.isArray(respostas[campo.id]) && respostas[campo.id].includes(o)} onChange={() => alternarOpcao(campo.id, o)} className="accent-teal-600" />
                      {o}
                    </label>
                  ))}
                </div>
              )}
              {campo.tipo === 'arquivo' && (
                <div className="mt-2 space-y-2">
                  {respostas[campo.id]?.url ? (
                    <p className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3.5 py-2.5 text-[0.75rem] font-semibold text-emerald-700">
                      <Icon name="clipboard" size={14} />
                      <span className="min-w-0 flex-1 truncate">{respostas[campo.id].nome}</span>
                      <button
                        type="button"
                        onClick={() => definir(campo.id, undefined)}
                        className="shrink-0 font-bold underline"
                      >
                        Trocar
                      </button>
                    </p>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-3.5 py-3 text-[0.78rem] font-semibold text-slate-500 transition hover:bg-slate-50">
                      <Icon name="camera" size={15} />
                      {enviandoArquivo === campo.id ? 'Enviando…' : 'Escolher arquivo'}
                      <input
                        type="file"
                        hidden
                        accept="image/*,application/pdf"
                        disabled={Boolean(enviandoArquivo)}
                        onChange={anexar(campo.id)}
                      />
                    </label>
                  )}
                  <p className="text-[0.7rem] text-slate-400">Foto ou PDF, até 10MB.</p>
                </div>
              )}
            </label>
          </Panel>
        ))}

        {erro && (
          <p className="flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3.5 py-2.5 text-[0.75rem] font-semibold text-red-600" role="alert">
            <Icon name="alert" size={15} /> {erro}
          </p>
        )}

        <button
          onClick={enviar}
          disabled={!completo || enviando}
          className="w-full rounded-2xl bg-teal-600 px-4 py-3.5 text-[0.85rem] font-bold text-white transition hover:bg-teal-700 disabled:opacity-50"
        >
          {enviando ? 'Enviando…' : 'Enviar respostas'}
        </button>
        {!completo && <p className="text-center text-[0.7rem] text-slate-400">Preencha os campos obrigatórios (*) para enviar.</p>}
      </div>
    </div>
  )
}
