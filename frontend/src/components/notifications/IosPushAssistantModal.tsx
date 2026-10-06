import { Icon } from '../ui/AppKit'

interface Props {
  isOpen: boolean
  onClose: () => void
}

export default function IosPushAssistantModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f343a] p-6 text-white shadow-2xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-primary">
              <Icon name="bell" size={22} />
            </span>
            <div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">Guia iPhone / iOS</span>
              <h2 className="text-base font-semibold leading-tight">Como ativar notificações no iOS</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-white/75">
          No iPhone, a Apple só autoriza notificações push para aplicativos que estão adicionados à <strong>Tela de Início</strong> (PWA). No Safari em aba comum, o sistema não entrega os avisos em tempo real.
        </p>

        <div className="mt-5 space-y-3.5">
          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-primary">1</span>
            <div className="text-xs text-white/80">
              Toque no botão <strong className="text-white">Compartilhar</strong> na barra inferior do Safari (o ícone de quadrado com uma seta apontando para cima).
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-primary">2</span>
            <div className="text-xs text-white/80">
              Role a lista para baixo e toque na opção <strong className="text-white">"Adicionar à Tela de Início"</strong>.
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/10 text-xs font-bold text-primary">3</span>
            <div className="text-xs text-white/80">
              Abra o app pelo novo ícone do <strong className="text-white">Saúde Pet</strong> na sua tela de início e ative as notificações!
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-2xl bg-primary py-3.5 text-center text-xs font-bold text-white shadow-lg transition hover:bg-[#127e82] active:scale-[0.99]"
        >
          Entendi, vou adicionar
        </button>
      </div>
    </div>
  )
}

