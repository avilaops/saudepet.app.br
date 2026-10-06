import type { ReactNode } from 'react'

/**
 * Cabeçalho das páginas de conteúdo/aquisição, no padrão torre de controle.
 * A navegação que vivia aqui subiu para o AdminShell — este componente virou
 * só o cartão de título + ações, mantendo a mesma API (title, actions) para
 * as cinco páginas que o usam não mudarem. `eyebrow` e `subtitle` são opcionais
 * para a tela dizer do que trata sem inventar outro cabeçalho.
 */
export default function AdminContentNav({ title, actions, eyebrow = 'Conteúdo & aquisição', subtitle }: {
  title: ReactNode
  actions?: ReactNode
  eyebrow?: ReactNode
  subtitle?: ReactNode
}) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:flex-row sm:items-center sm:p-8">
      <div>
        <span className="text-xs font-extrabold uppercase tracking-wider text-teal-600">{eyebrow}</span>
        <h1 className="mt-1 text-2xl font-black text-slate-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
