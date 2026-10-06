import type { ApiPayload } from '../types/api'
import { useState } from 'react'
import api from '../services/api'

const TIPOS = [
  ['abuso_verbal', 'Abuso verbal'],
  ['assedio', 'Assédio'],
  ['conteudo_inapropriado', 'Conteúdo inapropriado'],
  ['fraude', 'Fraude ou cobrança indevida'],
  ['informacao_falsa', 'Informação falsa'],
  ['spam', 'Spam'],
  ['violacao_termos', 'Violação dos termos de uso'],
  ['other', 'Outro'],
]

const GRAVIDADES = [
  [1, 'Leve — desconforto, sem risco'],
  [3, 'Média — conduta imprópria'],
  [5, 'Grave — risco, fraude ou abuso sério'],
]

/**
 * Denúncia de conduta, de qualquer usuário contra qualquer usuário.
 * Alimenta a fila de moderação do admin (/admin/moderacao); sem este ponto
 * de entrada a fila ficava eternamente vazia.
 */
export default function ReportarViolacaoModal({ usuarioId, nomeAlvo, onClose }: ApiPayload) {
  const [tipo, setTipo] = useState('abuso_verbal')
  const [gravidade, setGravidade] = useState(3)
  const [descricao, setDescricao] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [erro, setErro] = useState<ApiPayload | null>(null)

  const enviar = async () => {
    setEnviando(true)
    setErro(null)
    try {
      await api.post('/moderacao/reportar', {
        usuario_id: usuarioId,
        tipo,
        gravidade,
        descricao: descricao.trim(),
      })
      setEnviado(true)
      window.setTimeout(onClose, 2000)
    } catch (error: any) {
      setErro(error.response?.data?.error || 'Não foi possível enviar a denúncia.')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-slate-900/60" onClick={onClose} aria-label="Fechar" />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        {enviado ? (
          <div className="py-6 text-center">
            <p className="text-3xl">✅</p>
            <p className="mt-2 text-sm font-bold text-slate-900">Denúncia registrada</p>
            <p className="mt-1 text-xs text-slate-500">A equipe de moderação vai analisar. Obrigado por reportar.</p>
          </div>
        ) : (
          <>
            <h2 className="text-base font-black text-slate-900">Denunciar {nomeAlvo || 'usuário'}</h2>
            <p className="mt-1 text-xs text-slate-500">
              A denúncia vai para a equipe de moderação com a sua identificação, e a outra pessoa não é notificada.
            </p>

            <label className="mt-4 block text-xs font-bold text-slate-600">
              O que aconteceu?
              <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                {TIPOS.map(([id, rotulo]) => <option key={id} value={id}>{rotulo}</option>)}
              </select>
            </label>

            <label className="mt-3 block text-xs font-bold text-slate-600">
              Gravidade
              <select value={gravidade} onChange={(e) => setGravidade(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                {GRAVIDADES.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
              </select>
            </label>

            <label className="mt-3 block text-xs font-bold text-slate-600">
              Descreva o ocorrido (obrigatório)
              <textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Conte o que aconteceu, quando e onde (chat, atendimento…). Quanto mais detalhes, melhor a análise."
                className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"
              />
            </label>

            {erro && <p className="mt-2 text-xs font-bold text-red-600" role="alert">{erro}</p>}

            <button
              onClick={enviar}
              disabled={descricao.trim().length < 10 || enviando}
              className="mt-4 w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-50"
            >
              {enviando ? 'Enviando…' : 'Enviar denúncia'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
