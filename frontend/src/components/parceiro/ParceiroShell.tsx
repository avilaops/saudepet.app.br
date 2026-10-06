import { useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import type { ApiPayload } from '../../types/api'
import {
  Building2,
  QrCode,
  LogOut,
  ChevronDown,
  Receipt,
  Stethoscope,
  Activity,
  Layers
} from 'lucide-react'

interface ParceiroShellProps {
  children: ReactNode
  partners?: ApiPayload[]
  selectedPartner?: ApiPayload | null
  onSelectPartner?: (partner: ApiPayload) => void
  onOpenScanner?: () => void
}

export default function ParceiroShell({
  children,
  partners = [],
  selectedPartner,
  onSelectPartner,
  onOpenScanner
}: ParceiroShellProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [menuAberto, setMenuAberto] = useState(false)

  const sair = async () => {
    await logout?.()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-[#0d141b] text-slate-100 flex flex-col antialiased selection:bg-teal-500 selection:text-white">
      {/* Topo / Barra de Navegação Corporativa */}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#0d141b]/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          
          {/* Marca + Seletor de Parceiro */}
          <div className="flex items-center gap-3.5">
            <NavLink to="/parceiro" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/15 border border-teal-500/30 text-teal-400 font-black text-sm group-hover:scale-105 transition">
                SP
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black tracking-wider uppercase text-teal-400">Saúde Pet</span>
                  <span className="rounded-full bg-teal-500/10 px-2 py-0.5 text-[10px] font-extrabold text-teal-300 border border-teal-500/20">
                    Parceiros
                  </span>
                </div>
                <span className="text-sm font-bold text-white block leading-tight truncate max-w-[200px] sm:max-w-[280px]">
                  {selectedPartner?.tradeName || 'Portal do Estabelecimento'}
                </span>
              </div>
            </NavLink>

            {/* Troca de Unidade / Parceiro se houver mais de um */}
            {partners.length > 1 && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuAberto(!menuAberto)}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 transition"
                >
                  <span>Trocar</span>
                  <ChevronDown size={14} />
                </button>
                {menuAberto && (
                  <div className="absolute left-0 mt-2 w-64 rounded-2xl border border-white/10 bg-[#16202c] p-2 shadow-2xl z-50 animate-in fade-in zoom-in-95">
                    <p className="px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                      Meus Estabelecimentos
                    </p>
                    {partners.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          onSelectPartner?.(p)
                          setMenuAberto(false)
                        }}
                        className={`w-full text-left rounded-xl px-3 py-2 text-xs font-semibold transition flex items-center justify-between ${
                          selectedPartner?.id === p.id
                            ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                            : 'text-slate-300 hover:bg-white/5'
                        }`}
                      >
                        <span className="truncate">{p.tradeName}</span>
                        {selectedPartner?.id === p.id && <span className="text-teal-400 text-xs">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Navegação Central */}
          <nav className="hidden md:flex items-center gap-1.5" aria-label="Navegação do Parceiro">
            <NavLink
              to="/parceiro"
              end
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  isActive
                    ? 'bg-white/10 text-teal-300 border border-white/15 shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Activity size={15} />
              <span>Balcão & Atendimentos</span>
            </NavLink>

            <NavLink
              to="/parceiro/financeiro"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  isActive
                    ? 'bg-white/10 text-teal-300 border border-white/15 shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Receipt size={15} />
              <span>Extrato & Fechamentos</span>
            </NavLink>

            <NavLink
              to="/parceiro/perfil"
              className={({ isActive }) =>
                `flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition ${
                  isActive
                    ? 'bg-white/10 text-teal-300 border border-white/15 shadow-sm'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`
              }
            >
              <Building2 size={15} />
              <span>Meu Estabelecimento</span>
            </NavLink>
          </nav>

          {/* Ações Rápidas & Sair */}
          <div className="flex items-center gap-2">
            {onOpenScanner && (
              <button
                type="button"
                onClick={onOpenScanner}
                className="flex items-center gap-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-slate-950 px-3.5 py-2 text-xs font-black shadow-lg shadow-teal-500/20 active:scale-95 transition"
                title="Bipar ou digitar voucher de indicação"
              >
                <QrCode size={16} />
                <span className="hidden sm:inline">Validar Voucher</span>
              </button>
            )}

            <button
              type="button"
              onClick={sair}
              className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-400 hover:bg-white/10 hover:text-slate-200 transition"
              title="Encerrar sessão"
            >
              <LogOut size={14} />
              <span className="hidden sm:inline">Sair</span>
            </button>
          </div>
        </div>

        {/* Barra Móvel de Navegação (sm/mobile) */}
        <div className="md:hidden border-t border-white/10 bg-[#0a1017] px-4 py-2 flex items-center justify-around">
          <NavLink
            to="/parceiro"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[11px] font-bold ${
                isActive ? 'text-teal-400' : 'text-slate-400'
              }`
            }
          >
            <Activity size={16} />
            <span>Balcão</span>
          </NavLink>
          <NavLink
            to="/parceiro/financeiro"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[11px] font-bold ${
                isActive ? 'text-teal-400' : 'text-slate-400'
              }`
            }
          >
            <Receipt size={16} />
            <span>Financeiro</span>
          </NavLink>
          <NavLink
            to="/parceiro/perfil"
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 text-[11px] font-bold ${
                isActive ? 'text-teal-400' : 'text-slate-400'
              }`
            }
          >
            <Building2 size={16} />
            <span>Unidades</span>
          </NavLink>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  )
}

