import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { Eyebrow, Icon, PageHeader, Panel } from '../../components/ui/AppKit'

const LEITURA_DA_NOTA: Record<number | string, string> = {
  1: 'Muito ruim',
  2: 'Ruim',
  3: 'Regular',
  4: 'Bom',
  5: 'Excelente'
}

export default function AvaliarAtendimento() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [nota, setNota] = useState(0)
  const [comentario, setComentario] = useState('')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState('')

  const handleSubmit = async (e: any) => {
    e.preventDefault()

    if (nota === 0) {
      setErro('Escolha de uma a cinco estrelas para enviar.')
      return
    }

    setLoading(true)
    setErro('')

    try {
      await api.post('/avaliacoes', {
        atendimento_id: id,
        nota,
        comentario
      })

      navigate('/tutor/historico')
    } catch (error: any) {
      // O erro morria num `alert` e a pessoa voltava para uma tela sem pista do
      // que houve. Agora ele fica na tela, junto do formulário preenchido.
      setErro(error.response?.data?.error || 'Não foi possível enviar sua avaliação agora.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container-app bg-surface-page pb-10">
      <PageHeader
        title="Avaliar atendimento"
        subtitle="Sua nota ajuda a manter a qualidade da rede"
        onBack={() => navigate('/tutor/historico')}
      />

      <form onSubmit={handleSubmit} className="space-y-4 px-5 pb-6 pt-5">
        {erro && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-[0.78rem] text-red-700" role="alert">
            {erro}
          </p>
        )}

        <Panel className="px-5 py-6 text-center">
          <Eyebrow className="text-slate-400">Como foi o atendimento?</Eyebrow>

          <div className="mt-4 flex justify-center gap-1.5" role="radiogroup" aria-label="Nota do atendimento">
            {[1, 2, 3, 4, 5].map((estrela) => (
              <button
                key={estrela}
                type="button"
                role="radio"
                aria-checked={nota === estrela}
                aria-label={`${estrela} estrela${estrela !== 1 ? 's' : ''}`}
                onClick={() => { setNota(estrela); setErro('') }}
                className={`flex h-12 w-12 items-center justify-center rounded-2xl border transition ${
                  estrela <= nota
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-slate-200/80 bg-white text-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon name="star" size={22} strokeWidth={estrela <= nota ? 1.8 : 1.5} />
              </button>
            ))}
          </div>

          {/* O rótulo ocupa a linha mesmo vazio: sem isso o cartão pula de altura
              a cada estrela escolhida. */}
          <p className="mt-3 min-h-[1.15rem] text-[0.8rem] font-semibold text-ink">
            {LEITURA_DA_NOTA[nota] || ''}
          </p>
        </Panel>

        <Panel className="px-4 py-4">
          <label className="block">
            <Eyebrow className="text-slate-400">Comentário (opcional)</Eyebrow>
            <textarea
              className="mt-1.5 min-h-[7rem] w-full resize-y rounded-xl border border-slate-200/80 bg-[#fafbfb] px-3.5 py-2.5 text-[0.8rem] leading-relaxed text-ink outline-none transition focus:border-primary"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="O que funcionou bem, o que poderia melhorar…"
            />
          </label>
        </Panel>

        <button
          type="submit"
          disabled={loading || nota === 0}
          className="w-full rounded-2xl bg-primary px-5 py-3.5 text-[0.85rem] font-semibold text-white transition hover:bg-[#127e82] disabled:opacity-40"
        >
          {loading ? 'Enviando…' : 'Enviar avaliação'}
        </button>
      </form>
    </div>
  )
}
