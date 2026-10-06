import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import api from '../../services/api'
import TutorBottomNav from '../../components/tutor/TutorBottomNav'
import { usePushAutomatico } from '../../lib/usePushAutomatico'
import NotificationBell from '../../components/notifications/NotificationBell'
import {
  Badge,
  Eyebrow,
  Icon,
  Panel,
  StatusDot
} from '../../components/ui/AppKit'

/**
 * Rótulo e tarja de status do chamado ativo
 */
const ROTULO_DO_STATUS: Record<string, string> = {
  criado: 'Enviando seu chamado',
  procurando_veterinario: 'Procurando veterinário próximo',
  oferta_enviada: 'Chamando veterinários na região',
  veterinario_encontrado: 'Veterinário a confirmar',
  aceito: 'Veterinário confirmado',
  a_caminho: 'Veterinário a caminho',
  chegou: 'Veterinário no local',
  atendimento_em_andamento: 'Atendimento em andamento',
  sem_veterinario: 'Nenhum veterinário disponível no momento'
}

const ANTES_DE_TER_VETERINARIO = ['criado', 'procurando_veterinario', 'oferta_enviada', 'sem_veterinario']

const TARJA_DO_STATUS = (status: string) => {
  if (status === 'sem_veterinario') return 'Chamado sem resposta'
  if (ANTES_DE_TER_VETERINARIO.includes(status)) return 'Seu chamado'
  return 'Atendimento em curso'
}

export default function TutorHome() {
  const { user } = useAuth()
  // Pede a permissão de notificação uma vez; o recado de bloqueio, quando há,
  // aparece atrás do sino, não como faixa na tela.
  usePushAutomatico()

  const navigate = useNavigate()
  const location = useLocation()
  
  const [aviso, setAviso] = useState(location.state?.aviso || '')
  const [pets, setPets] = useState<ApiPayload[]>([])
  const [solicitacaoAtiva, setSolicitacaoAtiva] = useState<ApiPayload | null>(null)
  const [historico, setHistorico] = useState<ApiPayload[]>([])
  const [agendamentos, setAgendamentos] = useState<ApiPayload[]>([])
  const [lembretes, setLembretes] = useState<ApiPayload[]>([])
  const [mercado, setMercado] = useState<ApiPayload>({ itens: 0, pedidos: 0 })

  const { socket } = useSocket()

  const carregarDadosCompletos = useCallback(async () => {
    try {
      const [petsRes, ativaRes, historicoRes, agendaRes, lembretesRes, mercadoRes] = await Promise.allSettled([
        api.get('/pets'),
        api.get('/solicitacoes/tutor/ativa'),
        api.get('/solicitacoes/tutor/lista'),
        api.get('/v1/agenda/meus-agendamentos'),
        api.get('/v1/lembretes'),
        api.get('/v1/mercado/resumo')
      ])

      if (petsRes.status === 'fulfilled') {
        setPets(petsRes.value.data?.pets || petsRes.value.data || [])
      }
      if (ativaRes.status === 'fulfilled') {
        setSolicitacaoAtiva(ativaRes.value.data || null)
      }
      if (historicoRes.status === 'fulfilled') {
        const items = Array.isArray(historicoRes.value.data) ? historicoRes.value.data : []
        setHistorico(items.filter((item) => ['finalizado', 'concluido'].includes(item.status)).slice(0, 3))
      }
      if (agendaRes.status === 'fulfilled') {
        const lista = agendaRes.value.data?.agendamentos || []
        setAgendamentos(lista.filter((item: ApiPayload) => ['pendente', 'confirmado'].includes(item.status)).slice(0, 2))
      }
      if (lembretesRes.status === 'fulfilled') {
        const lista = lembretesRes.value.data?.lembretes || []
        setLembretes(lista.filter((l: ApiPayload) => !l.concluido).slice(0, 3))
      }
      if (mercadoRes.status === 'fulfilled') {
        setMercado({
          itens: Number(mercadoRes.value.data?.itens_no_carrinho || 0),
          pedidos: Number(mercadoRes.value.data?.pedidos_abertos || 0)
        })
      }
    } catch {
      setAviso('Não foi possível atualizar alguns dados agora.')
    }
  }, [])

  useEffect(() => {
    carregarDadosCompletos()
  }, [carregarDadosCompletos])

  useEffect(() => {
    if (!socket) return
    const handleAtualizacao = () => carregarDadosCompletos()
    socket.on('solicitacao:aceita', handleAtualizacao)
    socket.on('atendimento:atualizado', handleAtualizacao)
    socket.on('solicitacao:status', handleAtualizacao)
    return () => {
      socket.off('solicitacao:aceita', handleAtualizacao)
      socket.off('atendimento:atualizado', handleAtualizacao)
      socket.off('solicitacao:status', handleAtualizacao)
    }
  }, [socket, carregarDadosCompletos])

  const handleChamarVeterinario = () => {
    if (pets.length === 0) {
      navigate('/tutor/pets', { state: { aviso: 'Cadastre um pet primeiro para chamar o atendimento veterinário.' } })
    } else {
      navigate('/tutor/solicitar')
    }
  }

  // Iniciais do avatar caso não haja foto cadastrada
  const iniciais = (user?.nome || 'Tutor')
    .split(' ')
    .slice(0, 2)
    .map((parte) => parte[0])
    .join('')
    .toUpperCase()

  return (
    <div className="container-app min-h-screen bg-surface-page pb-24">
      {/* CABEÇALHO DO TUTOR PADRONIZADO (Estilo Console 21st / VetHome) */}
      <header className="relative overflow-hidden bg-ink px-5 pb-6 pt-6 text-white shadow-md">
        <div className="pointer-events-none absolute -right-12 -top-20 h-56 w-56 rounded-full bg-primary/25 blur-3xl" />
        
        {/* Barra superior de marca e notificações */}
        <div className="relative flex items-center justify-between gap-3 border-b border-white/10 pb-4">
          <Link to="/tutor/home" className="flex items-center gap-2">
            <img src="/brand/logo-symbol.png" alt="Saúde Pet" className="h-7 w-7 object-contain" />
            <strong className="text-sm font-bold tracking-tight text-white">Saúde Pet</strong>
          </Link>
          <div className="flex items-center gap-2">
            <NotificationBell />
            <Link
              to="/tutor/perfil"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/5 text-white/90 transition hover:bg-white/10"
              title="Meu Perfil"
              aria-label="Meu Perfil"
            >
              <Icon name="user" size={16} />
            </Link>
          </div>
        </div>

        {/* Perfil do Tutor Espelhado no estilo do Médico Veterinário */}
        <div className="relative mt-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            {/* Foto de Perfil / Avatar */}
            <Link to="/tutor/perfil" className="relative group shrink-0">
              <div className="h-12 w-12 overflow-hidden rounded-2xl border-2 border-white/20 bg-white/10 shadow-sm transition group-hover:border-primary">
                {user?.foto_perfil ? (
                  <img src={user.foto_perfil} alt={user.nome} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-primary/20 text-sm font-black text-primary">
                    {iniciais}
                  </div>
                )}
              </div>
            </Link>

            {/* Nome, Saudação e Avaliação com Estrelas */}
            <div className="min-w-0">
              <p className="text-[11px] font-medium text-white/60">Seja bem-vindo(a),</p>
              <h1 className="truncate text-[1.15rem] font-bold tracking-tight text-white">
                {user?.nome || 'Tutor'}
              </h1>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-white/75 font-medium">
                <span className="flex items-center gap-1 text-amber-400">
                  <Icon name="star" size={13} className="fill-amber-400 text-amber-400" />
                  <strong className="text-white">{user?.avaliacao_media ? Number(user.avaliacao_media).toFixed(1) : '5.0'}</strong>
                </span>
                <span className="text-white/40">·</span>
                <span>{historico.length} {historico.length === 1 ? 'atendimento' : 'atendimentos'}</span>
              </div>
            </div>
          </div>

          {/* Atalho Rápido de Meus Pets */}
          <Link
            to="/tutor/pets"
            className="flex flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-center transition hover:bg-white/10 shrink-0"
            title="Gerenciar Pets"
          >
            <span className="text-[10px] uppercase tracking-wider text-white/60 font-bold">Pets</span>
            <strong className="text-sm font-black text-white">{pets.length}</strong>
          </Link>
        </div>

        {/* Notificação de Atendimento Ativo (caso exista) */}
        {solicitacaoAtiva && (
          <button
            onClick={() => navigate(`/tutor/acompanhar/${solicitacaoAtiva.id}`)}
            className="relative mt-4 flex w-full items-center gap-3 rounded-2xl border border-primary/40 bg-primary/15 px-4 py-3.5 text-left transition hover:bg-primary/25"
          >
            <StatusDot live={solicitacaoAtiva.status !== 'sem_veterinario'} />
            <span className="min-w-0 flex-1">
              <Eyebrow className="block text-primary/80">{TARJA_DO_STATUS(solicitacaoAtiva.status)}</Eyebrow>
              <span className="mt-0.5 block truncate text-[0.85rem] font-bold text-white">
                {ROTULO_DO_STATUS[solicitacaoAtiva.status] || 'Acompanhar atendimento'}
              </span>
            </span>
            <Icon name="chevron" size={16} className="shrink-0 text-white/70" />
          </button>
        )}
      </header>

      {/* `px-5` como no resto do app: a home usava `px-4` e o conteúdo dela
          ficava 4px mais largo que o das telas para as quais ela leva, o que
          se percebe ao navegar mesmo sem saber nomear. */}
      <div className="space-y-4 px-5 pb-6 pt-5">
        {/* Aviso de Sessão / Estado */}
        {aviso && (
          <div className="flex items-start justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.78rem] text-amber-800 shadow-sm" role="status">
            <span>{aviso}</span>
            <button type="button" className="font-bold hover:text-amber-950" onClick={() => setAviso('')} aria-label="Dispensar aviso">✕</button>
          </div>
        )}

        {/* BOTÃO HERO: CHAMAR VETERINÁRIO EM DOMICÍLIO */}
        {!solicitacaoAtiva && (
          <button
            onClick={handleChamarVeterinario}
            className="group relative flex w-full items-center gap-3.5 overflow-hidden rounded-2xl bg-gradient-to-r from-primary to-[#0f766e] px-4 py-4 text-left text-white shadow-[0_10px_25px_-8px_rgba(13,148,136,0.6)] transition hover:shadow-[0_14px_28px_-6px_rgba(13,148,136,0.7)] active:scale-[0.99]"
          >
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-white/10 blur-xl" />
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20 text-white shadow-sm transition group-hover:scale-105">
              <Icon name="ambulance" size={22} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[0.95rem] font-bold tracking-tight">Chamar veterinário agora</span>
              <span className="mt-0.5 block text-[0.72rem] text-white/80">Atendimento domiciliar rápido e humanizado</span>
            </span>
            <Icon name="chevron" size={18} className="shrink-0 text-white/70 transition group-hover:translate-x-0.5" />
          </button>
        )}

        {/* 1. SEÇÃO MEUS PETS (DIRETO NA HOME, SEM TELAS ESCONDIDAS) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Icon name="paw" size={16} className="text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Meus Pets</h2>
            </div>
            <Link to="/tutor/pets" className="text-xs font-bold text-primary hover:underline">
              {pets.length === 0 ? '+ Cadastrar pet' : 'Ver todos'}
            </Link>
          </div>

          {pets.length === 0 ? (
            <Panel className="p-4 text-center">
              <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <Icon name="paw" size={20} />
              </span>
              <h3 className="mt-2 text-xs font-bold text-ink">Nenhum pet cadastrado</h3>
              <p className="mt-1 text-[11px] text-slate-500">Adicione seu cão, gato ou pet para solicitar atendimentos e acompanhar a carteira digital.</p>
              <button
                type="button"
                onClick={() => navigate('/tutor/pets')}
                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-primary px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#0f766e]"
              >
                <Icon name="plus" size={14} />
                <span>Cadastrar primeiro pet</span>
              </button>
            </Panel>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {pets.slice(0, 3).map((pet) => (
                <button
                  key={pet.id}
                  type="button"
                  onClick={() => navigate(`/tutor/pets/${pet.id}/carteira`)}
                  className="flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 text-left shadow-sm transition hover:border-primary/50 hover:bg-slate-50/80"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary/10 text-base font-bold text-primary">
                    {pet.foto_url || pet.foto ? (
                      <img src={pet.foto_url || pet.foto} alt={pet.nome} className="h-full w-full object-cover" />
                    ) : (
                      '🐾'
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-xs font-bold text-ink">{pet.nome}</strong>
                    <span className="block truncate text-[10px] text-slate-400">{pet.raca || pet.especie || 'Pet'}</span>
                  </div>
                </button>
              ))}

              <button
                type="button"
                onClick={() => navigate('/tutor/pets')}
                className="flex items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-3 text-xs font-bold text-slate-600 transition hover:border-primary hover:text-primary"
              >
                <Icon name="plus" size={14} />
                <span>Novo pet</span>
              </button>
            </div>
          )}
        </section>

        {/* 2. SEÇÃO MINHAS CONSULTAS & AGENDAMENTOS */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Icon name="clock" size={16} className="text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Minhas Consultas</h2>
            </div>
            <Link to="/tutor/agenda" className="text-xs font-bold text-primary hover:underline">
              Ver agenda completa
            </Link>
          </div>

          {agendamentos.length === 0 ? (
            <Panel className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                  <Icon name="clock" size={17} />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-ink">Nenhuma consulta agendada</h4>
                  <p className="text-[11px] text-slate-400">Agende vacinas e check-ups com hora marcada</p>
                </div>
              </div>
              <Link
                to="/tutor/agenda"
                className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
              >
                Agendar
              </Link>
            </Panel>
          ) : (
            <div className="space-y-2">
              {agendamentos.map((consulta) => (
                <Panel key={consulta.id} className="p-3.5 transition hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                        <Icon name="clock" size={17} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="truncate text-xs font-bold text-ink">{consulta.pet?.nome || 'Consulta do Pet'}</strong>
                          {consulta.status === 'pendente' && <Badge tone="amber">Confirmar</Badge>}
                        </div>
                        <span className="block text-[11px] text-slate-400">
                          {consulta.data_agendada ? new Date(consulta.data_agendada).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Horário a definir'} · {consulta.veterinario?.usuario?.nome ? `Dr(a). ${consulta.veterinario.usuario.nome}` : 'Veterinário parceiro'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/tutor/agenda')}
                      className="shrink-0 rounded-xl bg-primary/10 px-2.5 py-1.5 text-xs font-bold text-primary hover:bg-primary/20 transition"
                    >
                      Detalhes
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* 3. SEÇÃO HISTÓRICO DE ATENDIMENTOS RECENTES */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Icon name="history" size={16} className="text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Histórico de Atendimentos</h2>
            </div>
            <Link to="/tutor/historico" className="text-xs font-bold text-primary hover:underline">
              Ver prontuários
            </Link>
          </div>

          {historico.length === 0 ? (
            <Panel className="p-3.5 text-center text-xs text-slate-400">
              Seus atendimentos finalizados e prontuários aparecerão aqui.
            </Panel>
          ) : (
            <div className="space-y-2">
              {historico.map((item) => (
                <Panel key={item.id} className="p-3.5 transition hover:border-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                        <Icon name="clipboard" size={16} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <strong className="truncate text-xs font-bold text-ink">{item.pet?.nome || 'Atendimento'}</strong>
                          <Badge tone="teal">Concluído</Badge>
                        </div>
                        <span className="block text-[11px] text-slate-400 truncate">
                          {item.criado_em ? new Date(item.criado_em).toLocaleDateString('pt-BR') : 'Data recente'} · {item.veterinario?.usuario?.nome ? `Dr(a). ${item.veterinario.usuario.nome}` : 'Veterinário'}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/tutor/historico')}
                      className="shrink-0 text-xs font-bold text-primary hover:underline"
                    >
                      Ver laudo
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* 4. SEÇÃO LEMBRETES E CUIDADOS PREVENTIVOS */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-1.5">
              <Icon name="bell" size={16} className="text-primary" />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Lembretes e Vacinas</h2>
            </div>
            <Link to="/tutor/lembretes" className="text-xs font-bold text-primary hover:underline">
              {lembretes.length > 0 ? `${lembretes.length} ativos` : 'Adicionar'}
            </Link>
          </div>

          {lembretes.length === 0 ? (
            <Panel className="flex items-center justify-between p-3.5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-600">
                  <Icon name="spark" size={17} />
                </span>
                <div>
                  <h4 className="text-xs font-bold text-ink">Vacinas e cuidados em dia</h4>
                  <p className="text-[11px] text-slate-400">Configure avisos de reforço, vermífugo e medicação</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/tutor/lembretes')}
                className="shrink-0 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 transition hover:bg-slate-200"
              >
                Configurar
              </button>
            </Panel>
          ) : (
            <div className="space-y-2">
              {lembretes.map((lembrete) => (
                <Panel key={lembrete.id} className="p-3.5 transition hover:border-slate-300">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <Icon name="shield" size={16} />
                      </span>
                      <div className="min-w-0">
                        <strong className="truncate text-xs font-bold text-ink">{lembrete.titulo}</strong>
                        <span className="block text-[11px] text-slate-400">
                          {lembrete.data_lembrete ? `Para ${new Date(lembrete.data_lembrete).toLocaleDateString('pt-BR')}` : 'Sem data'} {lembrete.pet?.nome ? `• ${lembrete.pet.nome}` : ''}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate('/tutor/lembretes')}
                      className="shrink-0 rounded-xl bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200 transition"
                    >
                      Ver
                    </button>
                  </div>
                </Panel>
              ))}
            </div>
          )}
        </section>

        {/* 5. ATALHO: SAÚDE PET MERCADO & FARMÁCIA */}
        <section>
          <Panel
            onClick={() => navigate('/tutor/mercado')}
            className="flex cursor-pointer items-center justify-between p-4 transition hover:border-primary/50 hover:bg-slate-50/50"
          >
            <div className="flex items-center gap-3.5">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
                <Icon name="inbox" size={19} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-ink">Mercado & Farmácia Pet</h3>
                  {mercado.itens > 0 && <Badge tone="teal">{mercado.itens} no carrinho</Badge>}
                </div>
                <p className="text-[11px] text-slate-500">Ração, medicamentos e produtos de pet shops locais</p>
              </div>
            </div>
            <Icon name="chevron" size={16} className="text-slate-300" />
          </Panel>
        </section>
      </div>

      <TutorBottomNav />
    </div>
  )
}
