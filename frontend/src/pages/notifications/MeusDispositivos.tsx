import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { Badge, EmptyState, Icon, PageHeader, Panel } from '../../components/ui/AppKit'
import { ativarPush, desativarPush, inscricaoConfirmada, suportaPush } from '../../lib/push'
import { isIos, isPwaStandalone, obterDispositivoAtual, type InfoDispositivo } from '../../lib/dispositivos'
import IosPushAssistantModal from '../../components/notifications/IosPushAssistantModal'

export default function MeusDispositivos() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [carregando, setCarregando] = useState(true)
  const [processando, setProcessando] = useState(false)
  const [dispositivoAtual, setDispositivoAtual] = useState<InfoDispositivo | null>(null)
  const [mensagemStatus, setMensagemStatus] = useState<string | null>(null)
  const [modalIosAberto, setModalIosAberto] = useState(false)

  const ehIos = isIos()
  const ehPwa = isPwaStandalone()

  const carregarStatus = async () => {
    setCarregando(true)
    try {
      const info = await obterDispositivoAtual()
      setDispositivoAtual(info)
    } finally {
      setCarregando(false)
    }
  }

  useEffect(() => {
    carregarStatus()
  }, [])

  const handleTogglePush = async () => {
    if (processando) return
    setProcessando(true)
    setMensagemStatus(null)

    // Se estiver no iOS Safari sem PWA instalada, orienta com o assistente antes de tentar
    if (ehIos && !ehPwa) {
      setModalIosAberto(true)
      setProcessando(false)
      return
    }

    try {
      if (dispositivoAtual?.statusServidor === 'ativo') {
        await desativarPush()
        setMensagemStatus('Notificações desativadas para este aparelho.')
      } else {
        const resultado = await ativarPush()
        if (resultado.ok) {
          setMensagemStatus('Notificações push ativadas com sucesso!')
        } else if (resultado.motivo === 'negado') {
          setMensagemStatus('A permissão foi negada no navegador. Habilite nas configurações do site.')
        } else if (resultado.motivo === 'sem-suporte') {
          setMensagemStatus('Este navegador não tem suporte a notificações push.')
        } else {
          setMensagemStatus('Não foi possível registrar no servidor. Tente novamente.')
        }
      }
      await carregarStatus()
    } catch {
      setMensagemStatus('Erro ao alterar status de notificações.')
    } finally {
      setProcessando(false)
    }
  }

  const getVoltarRoute = () => {
    if (user?.tipo_usuario === 'veterinario') return '/veterinario/notificacoes'
    if (user?.tipo_usuario === 'super_admin' || user?.tipo_usuario === 'admin') return '/admin/notificacoes'
    return '/tutor/notificacoes'
  }

  return (
    <div className="min-h-screen bg-surface-page pb-24">
      <PageHeader
        title="Meus Dispositivos"
        subtitle="Aparelhos autorizados a receber notificações push"
        onBack={() => navigate(getVoltarRoute())}
      />

      <div className="mx-auto max-w-2xl space-y-4 px-4 pt-4">
        {mensagemStatus && (
          <div
            className="flex items-center justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-xs text-primary"
            role="status"
          >
            <span>{mensagemStatus}</span>
            <button
              type="button"
              onClick={() => setMensagemStatus(null)}
              className="text-xs font-bold hover:text-primary"
            >
              ✕
            </button>
          </div>
        )}

        {/* Card do Aparelho Atual */}
        <Panel className="p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink text-white">
                <Icon name={dispositivoAtual?.tipo === 'smartphone' ? 'bell' : 'spark'} size={20} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-ink">
                    {dispositivoAtual?.nome || 'Dispositivo Atual'}
                  </h3>
                  <Badge tone="teal">Este aparelho</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-400">
                  {dispositivoAtual?.sistema} · {dispositivoAtual?.navegador}
                </p>
              </div>
            </div>

            <div>
              {carregando ? (
                <span className="text-[11px] text-slate-400">Verificando...</span>
              ) : dispositivoAtual?.statusServidor === 'ativo' ? (
                <Badge tone="teal">Ativo no servidor</Badge>
              ) : dispositivoAtual?.statusServidor === 'sem-suporte' ? (
                <Badge tone="slate">Sem suporte</Badge>
              ) : (
                <Badge tone="amber">Pendente</Badge>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-3.5 text-xs text-slate-600">
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Status verificado:</span>
              <span className="font-semibold text-ink">
                {dispositivoAtual?.statusServidor === 'ativo'
                  ? 'Confirmado pelo servidor Saúde Pet'
                  : 'Aguardando autorização'}
              </span>
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-slate-400">Modo de execução:</span>
              <span className="font-semibold text-ink">
                {ehPwa ? 'Aplicativo PWA (Tela de Início)' : 'Navegador Web'}
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
            {ehIos && !ehPwa && (
              <button
                type="button"
                onClick={() => setModalIosAberto(true)}
                className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Icon name="spark" size={14} />
                <span>Como ativar no iPhone</span>
              </button>
            )}

            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                disabled={processando || !suportaPush()}
                onClick={handleTogglePush}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white shadow-sm transition active:scale-95 disabled:opacity-50 ${
                  dispositivoAtual?.statusServidor === 'ativo'
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-primary hover:bg-[#127e82]'
                }`}
              >
                {processando
                  ? 'Processando...'
                  : dispositivoAtual?.statusServidor === 'ativo'
                  ? 'Desativar neste aparelho'
                  : 'Ativar notificações'}
              </button>
            </div>
          </div>
        </Panel>

        {/* Card explicativo de privacidade e sigilo */}
        <Panel className="p-4 bg-white/75">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
              <Icon name="shield" size={16} />
            </span>
            <div className="text-xs leading-relaxed text-slate-500">
              <strong className="text-ink">Privacidade na tela bloqueada:</strong> Por padrão de sigilo médico e LGPD, nenhuma notificação exibe prescrições ou diagnósticos na tela bloqueada do aparelho. As notificações mostram apenas avisos neutros de atualização.
            </div>
          </div>
        </Panel>

        {/* Assistente para iPhone se aplicável */}
        {ehIos && !ehPwa && (
          <Panel className="border-primary/20 bg-primary/5 p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Icon name="bell" size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-ink">Instalação no iPhone necessária</h4>
                <p className="mt-1 text-xs text-slate-600">
                  O iOS requer que o Saúde Pet esteja adicionado à Tela de Início para habilitar alertas push.
                </p>
                <button
                  type="button"
                  onClick={() => setModalIosAberto(true)}
                  className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline"
                >
                  <span>Ver passo a passo</span>
                  <Icon name="chevron" size={13} />
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      <IosPushAssistantModal
        isOpen={modalIosAberto}
        onClose={() => setModalIosAberto(false)}
      />
    </div>
  )
}

