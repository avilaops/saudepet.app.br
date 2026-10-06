import type { ReactNode } from 'react'

/**
 * Peças repetidas das telas de conteúdo do admin, na mesma linguagem do
 * AppKit (tutor/vet): cartão branco rounded-2xl, borda de um fio, sombra
 * quase inexistente, teal (`primary`) como única cor de ação. Antes o admin
 * era um segundo sistema visual — rounded-3xl, shadow-xl, botão slate-900 —
 * e cada uma das 26 telas parecia de outro produto.
 *
 * Exceções intencionais ficam fora daqui: modais e drawers continuam com
 * shadow-2xl nas próprias telas, porque flutuam sobre a página.
 */

/** Cartão branco com título opcional — equivalente ao `Panel` do AppKit. */
export function Painel({ titulo, acoes, children, className = '' }: { titulo?: ReactNode; acoes?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm ${className}`}>
      {(titulo || acoes) && (
        <div className="mb-4 flex items-center justify-between gap-4">
          {titulo && <h2 className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{titulo}</h2>}
          {acoes}
        </div>
      )}
      {children}
    </section>
  )
}

/**
 * Mesma semântica de cor do antigo .status-*: verde para avanço, vermelho para
 * perda, âmbar para espera, slate para o resto.
 */
const TONS_STATUS = {
  novo: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  publicado: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  convertido: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  perdido: 'bg-red-50 text-red-700 ring-red-200',
  agendado: 'bg-amber-50 text-amber-700 ring-amber-200',
  qualificado: 'bg-amber-50 text-amber-700 ring-amber-200',
}

export function StatusPill({ status }: { status: string }) {
  const tom = TONS_STATUS[status as keyof typeof TONS_STATUS] || 'bg-slate-100 text-slate-600 ring-slate-200'
  return (
    <span className={`inline-flex w-max items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ring-1 ${tom}`}>
      {status}
    </span>
  )
}

/** Rótulo + controle. */
export function Campo({ rotulo, children, className = '' }: { rotulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">{rotulo}</span>
      {children}
    </label>
  )
}

/** Classes de input/select/textarea — mesmo foco do `.input` global. */
export const entrada =
  'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-800 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/30'

export const botaoPrimario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-700 active:scale-[.98] disabled:opacity-50'

export const botaoSecundario =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-ink transition hover:bg-slate-50 active:scale-[.98] disabled:opacity-50'

export const botaoPerigo =
  'inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-50'

/** Aviso inline (erro/alerta), no lugar de <p role="alert"> sem estilo. */
export function Aviso({ tom = 'erro', children }: { tom?: 'erro' | 'alerta' | 'info'; children: ReactNode }) {
  const tons = {
    erro: 'border-red-200 bg-red-50 text-red-700',
    alerta: 'border-amber-200 bg-amber-50 text-amber-800',
    info: 'border-slate-200 bg-slate-50 text-slate-600',
  }
  return (
    <p role="alert" className={`rounded-xl border px-4 py-3 text-xs font-semibold ${tons[tom]}`}>
      {children}
    </p>
  )
}

/** Estado vazio padronizado. */
export function Vazio({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 px-6 py-12 text-center text-xs font-semibold text-slate-400">{children}</p>
}
