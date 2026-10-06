import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react'

/**
 * Kit visual comum das telas de painel (tutor, veterinário e admin).
 */

const TRACOS = {
  home: 'M3 11.4 12 4l9 7.4V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.6Z',
  paw: 'M5.5 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm13 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4ZM9.5 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm5 0a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm-5.9 6.6C7.6 15.6 7 16.6 7 17.7 7 19 8 20 9.3 20c.9 0 1.7-.4 2.7-.4s1.8.4 2.7.4c1.3 0 2.3-1 2.3-2.3 0-1.1-.6-2.1-1.6-3.1-1-1-1.7-2.1-3.4-2.1s-2.4 1.1-3.4 2.1Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  message: 'M21 15a4 4 0 0 1-4 4H8l-5 2 1.5-4A8 8 0 1 1 21 15Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 9a7 7 0 0 0-14 0',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm13 9v-1.5a4 4 0 0 0-3-3.9M16 4.1a3.5 3.5 0 0 1 0 6.8',
  power: 'M12 3v9m6.4-5.4a9 9 0 1 1-12.8 0',
  chart: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  inbox: 'M3 13h4l2 3h6l2-3h4M5 5h14l2 8v6H3v-6l2-8Z',
  edit: 'M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Zm10-13 3 3',
  image: 'M4 5h16v14H4V5Zm0 11 5-5 4 4 2-2 5 5M15 9h.01',
  vet: 'M12 21a5 5 0 0 0 5-5v-3M7 4v4a5 5 0 0 0 5 5m5 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM5 4v4M9 4v4',
  clipboard: 'M9 4h6v3H9V4Zm-2 1H5v16h14V5h-2M9 12h6m-6 4h4',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  chevron: 'm9 18 6-6-6-6',
  logout: 'M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5m4-4 4-4-4-4m4 4H9',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.6 17.1A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.9L13.7 3.9a2 2 0 0 0-3.4 0Z',
  ambulance: 'M3 7h11v9H3V7Zm11 3h3.5l2.5 3v3h-6v-6ZM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Zm10 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM8 10h3M9.5 8.5v3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  crown: 'm3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Zm3 9h12',
  send: 'm3 11 18-8-8 18-2-7-8-3Zm8 3 10-11',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  close: 'M6 18 18 6M6 6l12 12',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  card: 'M3 6h18v12H3V6Zm0 4h18M7 14h4',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4V8Zm8 8.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  trash: 'M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13M10 11v6m4-6v6',
  pencil: 'M4 20h4l10-10a2.1 2.1 0 0 0-3-3L5 17v3Zm10-13 3 3',
  route: 'M6 20a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12-10a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm0 0v3a4 4 0 0 1-4 4h-4a4 4 0 0 0-4 4',
  spark: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  pin: 'M12 21s7-6.3 7-11a7 7 0 1 0-14 0c0 4.7 7 11 7 11Zm0-8.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'
};

export function Icon({ name, size = 18, className = '', strokeWidth = 1.6 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={TRACOS[name as keyof typeof TRACOS] || TRACOS.spark} />
    </svg>
  );
}

/** Ponto de estado. Ao vivo pulsa; o resto fica quieto. */
export function StatusDot({ live = false, tone = 'teal' }: { live?: boolean; tone?: 'teal' | 'slate' | 'amber' }) {
  const cor = { teal: 'bg-primary', slate: 'bg-slate-400', amber: 'bg-amber-500' }[tone];
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {live && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-70 ${cor}`} />}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${cor}`} />
    </span>
  );
}

export function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}>
      {children}
    </span>
  );
}

/**
 * Cabeçalho em tinta. É o que dá o tom "instrumento" às três telas sem escurecer
 * o app inteiro: painel escuro em cima, leitura clara embaixo.
 */
export function ConsoleHeader({ label, title, subtitle, status, action, avatar, children }: {
  label?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  status?: ReactNode
  action?: ReactNode
  avatar?: ReactNode
  children?: ReactNode
}) {
  return (
    <header className="relative overflow-hidden bg-ink px-6 pb-6 pt-7 text-white">
      {/* Brilho discreto do acento, para o painel não ficar chapado. */}
      <div className="pointer-events-none absolute -right-16 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative flex items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          {avatar}
          <div className="min-w-0">
            {(label || status) && (
              <div className="flex items-center gap-2 text-white/55">
                {status}
                {label && <Eyebrow>{label}</Eyebrow>}
              </div>
            )}
            <h1 className="mt-0.5 truncate text-[1.35rem] font-semibold leading-tight tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-[0.78rem] leading-relaxed text-white/60">{subtitle}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </header>
  );
}

export function PageHeader({ title, subtitle, onBack, action }: { title: ReactNode; subtitle?: ReactNode; onBack?: () => void; action?: ReactNode }) {
  return (
    <header className="relative overflow-hidden bg-ink px-5 pb-5 pt-5 text-white">
      <div className="pointer-events-none absolute -right-20 -top-24 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative flex items-center gap-3">
        {onBack && (
          <button
            onClick={onBack}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/80 transition hover:bg-white/10"
            aria-label="Voltar"
          >
            <Icon name="chevron" size={16} className="rotate-180" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.05rem] font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 truncate text-[0.72rem] text-white/55">{subtitle}</p>}
        </div>
        {action}
      </div>
    </header>
  );
}

/** Botão fantasma do cabeçalho (sair, atualizar). */
export function GhostAction({ onClick, icon, label }: { onClick: () => void; icon?: string; label: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="flex shrink-0 items-center gap-1.5 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-[0.72rem] font-semibold text-white/80 transition hover:bg-white/10"
    >
      {icon && <Icon name={icon} size={15} />}
      {label}
    </button>
  );
}

/**
 * Corpo de uma tela de painel: a mesma margem lateral e o mesmo respiro entre
 * blocos em todas elas.
 *
 * Existe porque cada tela repetia `px-5 py-5` com um `space-y` diferente
 * (3, 3.5, 4), e componentes soltos como o de notificações traziam o seu
 * próprio empilhamento por dentro — o que somava dois espaços entre dois
 * cartões e um só entre os outros. O ritmo irregular vinha daí, não do
 * conteúdo.
 */
export function PageBody({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`space-y-4 px-5 pb-6 pt-5 ${className}`}>{children}</div>;
}

/**
 * Cabeçalho de um cartão: título e, quando ajuda, uma linha de apoio.
 * O espaço abaixo dele é do cartão, não do texto.
 */
export function PanelTitle({ title, hint }: { title: ReactNode; hint?: ReactNode }) {
  return (
    <div>
      <h3 className="text-[0.9rem] font-semibold text-ink">{title}</h3>
      {hint && <p className="mt-1 text-[0.75rem] leading-relaxed text-slate-500">{hint}</p>}
    </div>
  );
}

/** Superfície padrão: borda de um fio, sombra quase inexistente. */
type PanelProps<T extends ElementType> = {
  children: ReactNode
  className?: string
  as?: T
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

export function Panel<T extends ElementType = 'section'>({ children, className = '', as, ...resto }: PanelProps<T>) {
  const Tag = as || 'section'
  return (
    <Tag
      className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,52,58,0.04)] ${className}`}
      {...resto}
    >
      {children}
    </Tag>
  );
}

/** Número grande com rótulo miúdo. O dado é o protagonista, não o cartão. */
export function Metric({ label, value, hint, live = false, tone = 'ink' }: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  live?: boolean
  tone?: 'ink' | 'teal' | 'amber'
}) {
  const corDoValor = { ink: 'text-ink', teal: 'text-primary', amber: 'text-amber-600' }[tone];
  return (
    <Panel className="px-4 py-3.5" as="div">
      <div className="flex items-center gap-1.5 text-slate-400">
        {live && <StatusDot live />}
        <Eyebrow>{label}</Eyebrow>
      </div>
      <p className={`mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight tabular-nums ${corDoValor}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-[0.7rem] text-slate-400">{hint}</p>}
    </Panel>
  );
}

/** Linha de leitura: rótulo à esquerda, número tabular à direita. */
export function DataRow({ label, value, tone = 'ink' }: { label: ReactNode; value: ReactNode; tone?: 'ink' | 'teal' | 'amber' | 'slate' }) {
  const cor = { ink: 'text-ink', teal: 'text-primary', amber: 'text-amber-600', slate: 'text-slate-500' }[tone];
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[0.8rem] text-slate-500">{label}</span>
      <span className={`text-[0.95rem] font-semibold tabular-nums ${cor}`}>{value}</span>
    </div>
  );
}

/** Linha de navegação. */
export function NavRow({ icon, label, hint, badge, onClick }: { icon: string; label: ReactNode; hint?: ReactNode; badge?: ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-slate-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-ink">
        <Icon name={icon} size={17} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.85rem] font-semibold text-ink">{label}</span>
        {hint && <span className="mt-0.5 block truncate text-[0.72rem] text-slate-400">{hint}</span>}
      </span>
      {badge}
      <Icon name="chevron" size={16} className="shrink-0 text-slate-300" />
    </button>
  );
}

export function Badge({ children, tone = 'slate' }: { children: ReactNode; tone?: 'slate' | 'teal' | 'amber' | 'red' }) {
  const estilo = {
    slate: 'bg-slate-100 text-slate-600',
    teal: 'bg-primary/10 text-primary',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-red-100 text-red-700'
  }[tone] || 'bg-slate-100 text-slate-600';

  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[0.68rem] font-bold tabular-nums ${estilo}`}>
      {children}
    </span>
  );
}

export function EmptyState({ icon = 'clock', title, description }: { icon?: string; title: ReactNode; description?: ReactNode }) {
  return (
    <Panel className="px-6 py-10 text-center">
      <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200/80 bg-slate-50 text-slate-400">
        <Icon name={icon} size={20} />
      </span>
      <h3 className="mt-3 text-[0.9rem] font-semibold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-1.5 max-w-xs text-[0.75rem] leading-relaxed text-slate-400">{description}</p>}
    </Panel>
  );
}
