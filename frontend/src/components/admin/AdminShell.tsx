import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'

/**
 * Casca única do admin — o painel cresceu em três ondas visuais e cada tela
 * tinha (ou não tinha) navegação própria.
 */
type SecaoAdmin = { rotulo: string; para: string; exato?: boolean }
type GrupoAdmin = { id: string; rotulo: string; secoes: SecaoAdmin[]; secoesSuper?: SecaoAdmin[] }

const GRUPOS: GrupoAdmin[] = [
  {
    id: 'operacao',
    rotulo: 'Operação',
    secoes: [
      { rotulo: 'Painel', para: '/admin', exato: true },
      { rotulo: 'Atendimentos', para: '/admin/atendimentos' },
      { rotulo: 'Veterinários', para: '/admin/veterinarios' },
      { rotulo: 'Usuários', para: '/admin/usuarios' },
      { rotulo: 'Monitoramento', para: '/admin/operacoes' },
    ],
  },
  {
    id: 'conteudo',
    rotulo: 'Conteúdo & aquisição',
    secoes: [
      { rotulo: 'Métricas', para: '/admin/analytics' },
      { rotulo: 'Leads', para: '/admin/leads' },
      { rotulo: 'Blog', para: '/admin/blog' },
      { rotulo: 'Banners', para: '/admin/banners' },
      { rotulo: 'WhatsApp', para: '/admin/whatsapp' },
      { rotulo: 'Parceiros', para: '/admin/parceiros' },
      { rotulo: 'Mercado', para: '/admin/mercado' },
      { rotulo: 'Cidades & Preços', para: '/admin/cidades' },
    ],
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    secoes: [
      { rotulo: 'Financeiro', para: '/admin/financeiro' },
      { rotulo: 'Pagamentos', para: '/admin/pagamentos' },
      { rotulo: 'Planos', para: '/admin/planos' },
      { rotulo: 'Repasses', para: '/admin/repasses' },
    ],
  },
  {
    id: 'sistema',
    rotulo: 'Sistema',
    secoes: [
      { rotulo: 'Moderação', para: '/admin/moderacao' },
      { rotulo: 'Formulários', para: '/admin/formularios' },
      { rotulo: 'Auditoria', para: '/admin/auditoria' },
      { rotulo: 'Notificações', para: '/admin/notificacoes' },
      { rotulo: 'Dispositivos', para: '/admin/dispositivos' },
    ],
    secoesSuper: [
      { rotulo: 'Organizações', para: '/admin/tenants' },
      { rotulo: 'Sistema', para: '/admin/sistema' },
    ],
  },
]

function grupoDaRota(pathname: string, grupos: GrupoAdmin[]): string {
  let melhor = { id: grupos[0].id, tamanho: -1 }
  for (const grupo of grupos) {
    for (const secao of grupo.secoes) {
      const casa = secao.exato
        ? pathname === secao.para
        : pathname === secao.para || pathname.startsWith(`${secao.para}/`)
      if (casa && secao.para.length > melhor.tamanho) {
        melhor = { id: grupo.id, tamanho: secao.para.length }
      }
    }
  }
  return melhor.id
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const superAdmin = user?.tipo_usuario === 'super_admin'

  const grupos = GRUPOS.map((grupo) => ({
    ...grupo,
    secoes: superAdmin && grupo.secoesSuper ? [...grupo.secoes, ...grupo.secoesSuper] : grupo.secoes,
  }))

  const grupoAtivo = grupoDaRota(pathname, grupos)
  const [grupoEscolhido, setGrupoEscolhido] = useState<string | null>(null)
  useEffect(() => { setGrupoEscolhido(null) }, [pathname])

  const grupoVisivel = grupos.find((g) => g.id === (grupoEscolhido || grupoAtivo)) || grupos[0]

  const sair = async () => {
    await logout?.()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-surface-page">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <NavLink to="/admin" className="flex shrink-0 items-center gap-2.5">
            <img src="/brand/logo-symbol.png" alt="" className="h-8 w-8 object-contain" />
            <span className="hidden sm:block">
              <span className="block text-[10px] font-extrabold uppercase tracking-wider text-teal-600">Saúde Pet</span>
              <span className="block text-sm font-black leading-none text-slate-900">Administração</span>
            </span>
          </NavLink>
          <nav className="flex flex-1 flex-wrap items-center gap-1" aria-label="Áreas da administração">
            {grupos.map((grupo) => {
              const aberto = grupo.id === grupoVisivel.id
              return (
                <button
                  key={grupo.id}
                  type="button"
                  onClick={() => setGrupoEscolhido(grupo.id)}
                  aria-current={grupo.id === grupoAtivo ? 'true' : undefined}
                  aria-expanded={aberto}
                  className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-bold transition ${
                    aberto
                      ? 'bg-slate-900 text-white shadow'
                      : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                  }`}
                >
                  {grupo.rotulo}
                  <span className="ml-1.5 text-[10px] font-extrabold opacity-60">{grupo.secoes.length}</span>
                </button>
              )
            })}
          </nav>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigate('/admin/notificacoes')}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition hover:bg-slate-200"
              title="Notificações"
              aria-label="Abrir central de notificações"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-8 12h4" />
              </svg>
            </button>
            <button
              onClick={sair}
              className="rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-200"
            >
              Sair
            </button>
          </div>
        </div>
        <div className="border-t border-slate-100 bg-slate-50/80">
          <nav
            className="mx-auto flex max-w-7xl flex-wrap items-center gap-1 px-4 py-2 sm:px-6 lg:px-8"
            aria-label={`Seções de ${grupoVisivel.rotulo}`}
          >
            {grupoVisivel.secoes.map((secao) => (
              <NavLink
                key={secao.para}
                to={secao.para}
                end={secao.exato}
                className={({ isActive }) =>
                  `whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                    isActive
                      ? 'bg-white text-teal-700 shadow-sm ring-1 ring-teal-200'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800'
                  }`
                }
              >
                {secao.rotulo}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">{children}</main>
    </div>
  )
}
