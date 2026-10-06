import type { ApiPayload } from '../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'

/**
 * Conclusão do pagamento de uma assinatura.
 *
 * Antes, assinar um plano pago ativava a assinatura na hora e criava uma
 * transação pendente que ninguém processava — o plano do tutor e o CRM do
 * veterinário saíam de graça, para sempre. Agora a assinatura nasce pendente e
 * só o webhook do gateway a ativa quando o dinheiro entra; esta tela é a ponte:
 * mostra o código PIX e espera a confirmação chegar.
 *
 * Usada pelas duas áreas (tutor e veterinário), por isso não usa AppKit nem
 * VetUI — só Tailwind, que existe nos dois.
 */
export default function PagamentoAssinaturaPix({ pagamento, plano, onAtivada, onFechar }: ApiPayload) {
  const [copiado, setCopiado] = useState(false)
  const [verificando, setVerificando] = useState(false)
  const [expirado, setExpirado] = useState(false)
  const jaAvisou = useRef(false)

  const codigo = pagamento?.pix_copy_paste || ''

  const verificar = useCallback(async ({ silencioso = false } = {}) => {
    if (!silencioso) setVerificando(true)
    try {
      const { data } = await api.get('/v1/billing/minha-assinatura')
      // `minha-assinatura` só devolve assinatura ATIVA: se veio algo, o webhook
      // já confirmou o pagamento.
      if (data?.assinatura && !jaAvisou.current) {
        jaAvisou.current = true
        onAtivada?.(data.assinatura)
      }
    } catch {
      // Falha de rede aqui não é erro do usuário — a próxima rodada tenta de novo.
    } finally {
      if (!silencioso) setVerificando(false)
    }
  }, [onAtivada])

  // O PIX é confirmado por webhook, então não há evento no navegador: só resta
  // perguntar de tempos em tempos. Cinco segundos é rápido o bastante para
  // parecer instantâneo e devagar o bastante para não martelar a API.
  useEffect(() => {
    const intervalo = window.setInterval(() => verificar({ silencioso: true }), 5000)
    return () => window.clearInterval(intervalo)
  }, [verificar])

  useEffect(() => {
    if (!pagamento?.expires_at) return undefined
    const restante = new Date(pagamento.expires_at).getTime() - Date.now()
    if (restante <= 0) { setExpirado(true); return undefined }
    const timer = window.setTimeout(() => setExpirado(true), restante)
    return () => window.clearTimeout(timer)
  }, [pagamento?.expires_at])

  const copiar = async () => {
    if (!codigo) return
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 3000)
    } catch {
      // Sem permissão de área de transferência o campo continua selecionável.
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/60 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <h2 className="text-base font-semibold tracking-tight text-slate-900">
          Pague para ativar {plano?.nome ? `o ${plano.nome}` : 'sua assinatura'}
        </h2>
        <p className="mt-1.5 text-[0.78rem] leading-relaxed text-slate-500">
          Copie o código abaixo e pague no aplicativo do seu banco. A assinatura é ativada automaticamente assim que o
          pagamento for confirmado — você não precisa voltar aqui.
        </p>

        {expirado ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.78rem] font-semibold text-amber-800">
            Este código PIX expirou. Feche e assine novamente para gerar um novo.
          </p>
        ) : codigo ? (
          <>
            <label className="mt-4 block">
              <span className="text-[0.68rem] font-bold uppercase tracking-wider text-slate-400">Código PIX copia e cola</span>
              <textarea
                readOnly
                rows={3}
                value={codigo}
                onFocus={(event) => event.target.select()}
                className="mt-1.5 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-[0.7rem] text-slate-700"
              />
            </label>
            <button
              type="button"
              onClick={copiar}
              className="mt-2 w-full rounded-2xl bg-primary px-4 py-3 text-[0.82rem] font-semibold text-white transition hover:opacity-90"
            >
              {copiado ? 'Código copiado' : 'Copiar código PIX'}
            </button>
          </>
        ) : (
          <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-[0.78rem] text-slate-600">
            A cobrança foi criada. Se o código PIX não aparecer, verifique o pagamento em instantes.
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => verificar()}
            disabled={verificando}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[0.8rem] font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {verificando ? 'Verificando…' : 'Já paguei'}
          </button>
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 rounded-2xl border border-slate-200 px-4 py-3 text-[0.8rem] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Fechar
          </button>
        </div>

        <p className="mt-3 text-center text-[0.7rem] text-slate-400">
          Enquanto o pagamento não é confirmado, a assinatura fica aguardando e nada é cobrado de novo.
        </p>
      </div>
    </div>
  )
}
