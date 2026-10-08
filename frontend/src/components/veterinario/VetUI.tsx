import { dataLocal } from '../../lib/datas'
import { useEffect, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import type { Usuario, Veterinario } from '../../types/api'

const paths = {
  back: 'M15 18l-6-6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 18L18 6M6 6l12 12',
  home: 'M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z',
  chart: 'M4 19V9m6 10V5m6 14v-7m4 7H2',
  calendar: 'M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 9a7 7 0 0 0-14 0',
  crown: 'm3 7 4 4 5-7 5 7 4-4-2 12H5L3 7Zm3 9h12',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  message: 'M21 15a4 4 0 0 1-4 4H8l-5 2 1.5-4A8 8 0 1 1 21 15Z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm0-12v2m0 13v2m8.5-8.5h-2m-13 0h-2m14.5-6-1.5 1.5m-9 9L6 18m12 0-1.5-1.5m-9-9L6 6',
  cart: 'M3 4h2l2.4 10.4a2 2 0 002 1.6h7.7a2 2 0 002-1.6L21 8H6M9 20a1 1 0 100-2 1 1 0 000 2zm8 0a1 1 0 100-2 1 1 0 000 2z',
  wallet: 'M4 7h15a2 2 0 0 1 2 2v9H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h13v3m0 5h4',
  document: 'M7 3h7l4 4v14H7V3Zm7 0v5h4M10 12h5m-5 4h5',
  support: 'M4 14v-2a8 8 0 0 1 16 0v2m-16 0h3v5H5a1 1 0 0 1-1-1v-4Zm16 0h-3v5h2a1 1 0 0 0 1-1v-4Z',
  logout: 'M10 5H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h5m4-4 4-4-4-4m4 4H9',
  power: 'M12 2v9m6.4-5.4a9 9 0 1 1-12.8 0',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  eye: 'M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Zm9.5 2.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z',
  pin: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  chevron: 'm9 18 6-6-6-6',
  check: 'm5 12 4 4L19 6',
  upload: 'M12 16V4m0 0L7 9m5-5 5 5M5 14v5h14v-5',
  send: 'm3 11 18-8-8 18-2-7-8-3Zm8 3 10-11',
  image: 'M4 5h16v14H4V5Zm0 11 5-5 4 4 2-2 5 5M15 9h.01',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4',
  moon: 'M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z',
  folder: 'M3 6h7l2 2h9v11H3V6Z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5l3 2',
  info: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-11v6m0-10h.01',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z',
  refresh: 'M20 7v5h-5M4 17v-5h5m9.5-4A8 8 0 0 0 5 7m.5 10A8 8 0 0 0 19 17',
  plus: 'M12 5v14M5 12h14',
  bank: 'M3 10h18M5 10v8m4-8v8m6-8v8m4-8v8M2 21h20M12 3l9 5H3l9-5Z',
  paw: 'M12 13c-3.5 0-6 2.4-6 5 0 2 1.5 3 3.2 2.2.9-.4 1.8-.7 2.8-.7s1.9.3 2.8.7C16.5 21 18 20 18 18c0-2.6-2.5-5-6-5ZM7 11c1.4 0 2.5-1.5 2.5-3.2S8.4 5 7 5 4.5 6.2 4.5 7.8 5.6 11 7 11Zm10 0c1.4 0 2.5-1.5 2.5-3.2S18.4 5 17 5s-2.5 1.2-2.5 2.8S15.6 11 17 11ZM12 9.5c1.4 0 2.5-1.7 2.5-3.5S13.4 3 12 3 9.5 4.2 9.5 6s1.1 3.5 2.5 3.5Z',
  health: 'M12 21s-8-4.7-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6.3-8 11-8 11Zm-3-9h6m-3-3v6',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 10a7 7 0 0 0-14 0M17 11a4 4 0 0 0 0-8m6 18a7 7 0 0 0-4.5-6.5',
  tag: 'M3 3h8l10 10-8 8L3 11V3Zm5 4h.01',
  more: 'M6 12h.01M12 12h.01M18 12h.01',
}

export function VetIcon({ name, size = 22, className = '', strokeWidth = 1.8 }: { name: string; size?: number; className?: string; strokeWidth?: number }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name as keyof typeof paths] || paths.info} />
    </svg>
  )
}

export function VetAvatar({ user, size = 'md' }: { user?: Usuario | null; size?: string }) {
  const initials = (user?.nome || 'Veterinário').split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  return user?.foto_perfil ? (
    <img className={`vet-avatar vet-avatar--${size}`} src={user.foto_perfil} alt={`Foto de ${user.nome}`} />
  ) : (
    <span className={`vet-avatar vet-avatar--${size} vet-avatar--fallback`} aria-label={`Perfil de ${user?.nome || 'veterinário'}`}>{initials}</span>
  )
}

export function VetPageHeader({ title, subtitle, onBack, action, compact = false }: {
  title: ReactNode
  subtitle?: ReactNode
  onBack?: () => void
  action?: ReactNode
  compact?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className={`vet-page-header ${compact ? 'vet-page-header--compact' : ''}`}>
      <button className="vet-icon-button vet-icon-button--glass" type="button" onClick={onBack || (() => navigate(-1))} aria-label="Voltar">
        <VetIcon name="back" />
      </button>
      <div className="vet-page-header__copy">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action && <div className="vet-page-header__action">{action}</div>}
    </header>
  )
}

/**
 * As cinco abas são o espaço mais escasso da tela no celular, então vão para o
 * que ele abre todo dia.
 *
 * O Clube saiu daqui em 01/09/2026 e foi para a gaveta: é a assinatura do
 * próprio profissional, aberta uma vez para contratar e raramente depois.
 * "Meus clientes" ocupou a vaga, que é onde o trabalho dele mora e antes só
 * existia escondido na gaveta.
 *
 * "Stats" virou "Números": o resto da interface está em português.
 */
const navItems = [
  { to: '/veterinario/home', label: 'Início', icon: 'home' },
  { to: '/veterinario/estatisticas', label: 'Números', icon: 'chart' },
  { to: '/veterinario/agendamentos', label: 'Agenda', icon: 'calendar' },
  { to: '/veterinario/clientes', label: 'Clientes', icon: 'users' },
  { to: '/veterinario/perfil', label: 'Perfil', icon: 'user' },
]

export function VetBottomNav() {
  return (
    <nav className="vet-bottom-nav" aria-label="Navegação do veterinário">
      {navItems.map((item) => (
        <NavLink key={item.to} to={item.to} className={({ isActive }) => `vet-bottom-nav__item ${isActive ? 'is-active' : ''}`}>
          <span className="vet-bottom-nav__icon"><VetIcon name={item.icon} size={21} /></span>
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

export function VetDrawer({ open, onClose, veterinarian, onLogout }: {
  open: boolean
  onClose: () => void
  veterinarian?: Veterinario | null
  onLogout: () => void
}) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    document.body.classList.add('vet-drawer-open')
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.classList.remove('vet-drawer-open')
    }
  }, [open, onClose])

  const go = (to: string) => {
    onClose()
    navigate(to)
  }
  const items: Array<[string, string, string | null, string]> = [
    ['user', veterinarian?.usuario?.nome || 'Meu perfil', veterinarian?.especialidade || 'Editar informações', '/veterinario/perfil'],
    ['users', 'Meus clientes', 'Clientela, agenda e retenção', '/veterinario/clientes'],
    ['calendar', 'Meus agendamentos', null, '/veterinario/agendamentos'],
    ['history', 'Histórico', null, '/veterinario/historico'],
    ['message', 'Mensagens', null, '/veterinario/mensagens'],
    ['settings', 'Configurações', null, '/veterinario/configuracoes'],
    ['crown', 'Clube Saúde PET', 'Seu plano e benefícios', '/veterinario/clube'],
    // O veterinário também é tutor: tem pet em casa, e a rota do Mercado já
    // autorizava os dois papéis desde sempre. Faltava a porta, então ele só
    // chegava lá digitando o endereço. Compra como tutor, com preço de tutor;
    // a conta com CNPJ e tabela B2B é outro produto, ainda não construído.
    ['cart', 'Mercado', 'Comprar ração e itens para o seu pet', '/tutor/mercado'],
    ['wallet', 'Cobranças', 'Gerar e acompanhar pagamentos', '/veterinario/cobrancas'],
    ['chart', 'Meus repasses', null, '/veterinario/repasses'],
    ['bank', 'Conta bancária', 'Onde você recebe', '/veterinario/conta-bancaria'],
    ['document', 'Privacidade e termos', null, '/privacidade'],
  ]

  return (
    <div className={`vet-drawer-layer ${open ? 'is-open' : ''}`} aria-hidden={!open}>
      <button className="vet-drawer-backdrop" type="button" onClick={onClose} aria-label="Fechar menu" tabIndex={open ? 0 : -1} />
      <aside className="vet-drawer" role="dialog" aria-modal="true" aria-label="Menu do veterinário">
        <div className="vet-drawer__header">
          <VetAvatar user={veterinarian?.usuario} size="lg" />
          <div><strong>{veterinarian?.usuario?.nome || 'Veterinário'}</strong><span>{veterinarian?.especialidade || 'Perfil profissional'}</span></div>
          <button type="button" className="vet-icon-button vet-icon-button--glass" onClick={onClose} aria-label="Fechar menu"><VetIcon name="close" /></button>
        </div>
        <div className="vet-drawer__body">
          {items.map(([icon, label, helper, to], index) => (
            <button key={to} type="button" className={index === 0 ? 'is-featured' : ''} onClick={() => go(to)}>
              <span className="vet-drawer__item-icon"><VetIcon name={icon} size={20} /></span>
              <span><strong>{label}</strong>{helper && <small>{helper}</small>}</span>
              <VetIcon name="chevron" size={17} />
            </button>
          ))}
          <button type="button" className="vet-drawer__logout" onClick={onLogout}>
            <span className="vet-drawer__item-icon"><VetIcon name="logout" size={20} /></span>
            <span><strong>Sair</strong></span>
            <VetIcon name="chevron" size={17} />
          </button>
        </div>
      </aside>
    </div>
  )
}

export function VetLoading({ label = 'Carregando' }: { label?: string }) {
  return <div className="vet-loading" role="status"><span className="vet-spinner" /><span>{label}</span></div>
}

export const formatMoney = (value: number | string | null | undefined) => Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
export const formatDate = (value: string | number | Date | null | undefined, withTime = false) => {
  if (!value) return 'Data não informada'
  // Dia de calendário (vacina, retorno) não recua um dia no fuso do Brasil.
  const date = withTime ? new Date(value) : dataLocal(value)
  if (Number.isNaN(date.getTime())) return 'Data não informada'
  return new Intl.DateTimeFormat('pt-BR', withTime ? { dateStyle: 'short', timeStyle: 'short' } : { dateStyle: 'short' }).format(date)
}
export const serviceLabel = (type?: string | null) => ({
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleconsulta',
  vacinacao: 'Vacinação',
  avaliacao: 'Avaliação clínica',
  consulta_rotina: 'Consulta de rotina'
}[type as string] || 'Atendimento')
