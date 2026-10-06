import { useLocation, useNavigate } from 'react-router-dom'
import { Icon } from '../ui/AppKit'

/**
 * Navegação inferior do tutor.
 *
 * Cada tela do tutor carregava a sua própria cópia, com SVG escrito à mão e o
 * item ativo decidido na unha — bastava esquecer de trocar a cor numa tela para
 * a barra mentir sobre onde a pessoa está. Agora existe uma só, e o item ativo
 * vem da rota.
 */
const ITENS = [
  { icon: 'home', label: 'Início', path: '/tutor/home' },
  { icon: 'paw', label: 'Pets', path: '/tutor/pets' },
  { icon: 'message', label: 'Mensagens', path: '/tutor/mensagens' },
  { icon: 'user', label: 'Perfil', path: '/tutor/perfil' }
]

export default function TutorBottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-md -translate-x-1/2 border-t border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="flex items-stretch justify-around px-2 py-2">
        {ITENS.map((item) => {
          // "Início" responde por /tutor e /tutor/home — sem isto o item nunca
          // acendia, porque a URL real é /tutor e o caminho comparado era outro.
          const alternativos = item.path === '/tutor/home' ? ['/tutor'] : []
          const ativo = pathname === item.path
            || pathname.startsWith(`${item.path}/`)
            || alternativos.includes(pathname)
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition ${ativo ? 'text-primary' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icon name={item.icon} size={19} strokeWidth={ativo ? 2 : 1.6} />
              <span className={`text-[0.65rem] ${ativo ? 'font-semibold' : 'font-medium'}`}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
