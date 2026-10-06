import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { useSocket } from '../../contexts/SocketContext'
import api from '../../services/api'
import { VetAvatar, VetBottomNav, VetDrawer, VetIcon, VetLoading, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'
import { usePushAutomatico } from '../../lib/usePushAutomatico'
import NotificationBell from '../../components/notifications/NotificationBell'

export default function VetHome() {
  const { user, logout } = useAuth()
  // Pede a permissão de notificação uma vez; o recado de bloqueio, quando há,
  // aparece atrás do sino, não como faixa na tela.
  usePushAutomatico()

  const navigate = useNavigate()
  const [veterinario, setVeterinario] = useState<ApiPayload | null>(null)
  const [online, setOnline] = useState(false)
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<ApiPayload[]>([])
  const [atendimentoAtivo, setAtendimentoAtivo] = useState<ApiPayload | null>(null)
  const [historico, setHistorico] = useState<ApiPayload[]>([])
  const [carteira, setCarteira] = useState<ApiPayload | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [error, setError] = useState('')
  // O que falta para entrar de plantão. Vem do servidor com o caminho de cada
  // item: dizer "não pode" sem dizer o que fazer é meio aviso.
  const [pendencias, setPendencias] = useState<ApiPayload[]>([])
  const { socket, emitVeterinarioOnline, emitVeterinarioOffline } = useSocket()

  useEffect(() => {
    if (!localStorage.getItem('vet_onboarding_concluido')) navigate('/veterinario/onboarding')
  }, [navigate])

  // "Agora não" era só um `filter()` no estado: o chamado voltava no próximo
  // carregamento e na próxima mensagem do socket, como se o vet não tivesse
  // dispensado nada. Guardamos a dispensa por profissional para que ela dure.
  // Chamado JÁ atribuído a ele é outra coisa — aí existe rota de recusa, que
  // devolve o caso para a fila em vez de escondê-lo.
  const chaveDispensados = veterinario?.id ? `saudepet_vet_dispensados_${veterinario.id}` : null
  const [dispensados, setDispensados] = useState<ApiPayload[]>([])

  useEffect(() => {
    if (!chaveDispensados) return
    try { setDispensados(JSON.parse(localStorage.getItem(chaveDispensados) || '[]')) } catch { setDispensados([]) }
  }, [chaveDispensados])

  const dispensarSolicitacao = async (request: ApiPayload) => {
    setSolicitacoesPendentes((items) => items.filter((item) => item.id !== request.id))

    if (request.veterinario_id && request.veterinario_id === veterinario?.id) {
      try {
        await api.put(`/solicitacoes/${request.id}/recusar`, { motivo: 'Não posso atender agora' })
      } catch {
        setError('Não foi possível recusar o chamado agora — ele pode reaparecer.')
      }
      return
    }

    if (!chaveDispensados) return
    // Guarda só os 50 mais recentes: chamado antigo não volta a aparecer de
    // qualquer forma, e a lista não precisa crescer para sempre.
    const proximos = [request.id, ...dispensados.filter((id) => id !== request.id)].slice(0, 50)
    setDispensados(proximos)
    try { localStorage.setItem(chaveDispensados, JSON.stringify(proximos)) } catch { /* sem storage, vale a sessão */ }
  }

  const carregarDados = useCallback(async () => {
    setError('')
    const [vetResult, historyResult, walletResult, disponiveisResult] = await Promise.allSettled([
      api.get('/veterinarios/meus-dados'),
      api.get('/solicitacoes/veterinario/lista'),
      api.get('/v1/billing/saldo'),
      // Chamados que já estavam esperando: sem isto, só aparecia o que
      // chegasse pelo socket enquanto a tela estivesse aberta.
      api.get('/solicitacoes/veterinario/disponiveis'),
    ])
    if (vetResult.status === 'fulfilled') {
      setVeterinario(vetResult.value.data)
      setOnline(Boolean(vetResult.value.data.online))
    } else {
      setError('Não foi possível carregar seu perfil agora.')
    }
    if (historyResult.status === 'fulfilled') {
      const items = Array.isArray(historyResult.value.data) ? historyResult.value.data : []
      setHistorico(items.filter((item) => ['finalizado', 'concluido'].includes(item.status)).slice(0, 3))
      // Quem recarrega no meio de um atendimento precisa de um caminho de volta.
      setAtendimentoAtivo(items.find((item) => ['veterinario_encontrado', 'aceito', 'a_caminho', 'chegou', 'atendimento_em_andamento'].includes(item.status)) || null)
    }
    if (walletResult.status === 'fulfilled') setCarteira(walletResult.value.data?.carteira || null)
    if (disponiveisResult.status === 'fulfilled') {
      const lista = disponiveisResult.value.data?.solicitacoes
      setSolicitacoesPendentes(Array.isArray(lista) ? lista : [])
    }
  }, [])

  useEffect(() => { carregarDados() }, [carregarDados])

  useEffect(() => {
    if (!socket || !veterinario) return undefined
    // O servidor já escolhe quem recebe (raio da cidade + distância real) e
    // manda para a sala pessoal do profissional. Antes cada app filtrava
    // comparando o NOME da cidade por igualdade exata — "São Paulo" e
    // "Sao Paulo" eram cidades diferentes, e o chamado sumia.
    const received = (solicitacao: ApiPayload) => {
      setSolicitacoesPendentes((previous) => previous.some((item) => item.id === solicitacao.id)
        ? previous
        : [solicitacao, ...previous].sort((a, b) => (a.distancia_km ?? Infinity) - (b.distancia_km ?? Infinity)))
    }
    const unavailable = (data: ApiPayload) => setSolicitacoesPendentes((previous) => previous.filter((item) => item.id !== data.solicitacaoId))
    socket.on('solicitacao:recebida', received)
    socket.on('solicitacao:indisponivel', unavailable)
    return () => {
      socket.off('solicitacao:recebida', received)
      socket.off('solicitacao:indisponivel', unavailable)
    }
  }, [socket, veterinario, user?.cidade])

  const toggleOnline = async () => {
    if (updatingStatus) return
    setUpdatingStatus(true)
    setError('')
    try {
      const next = !online
      let position = {}
      if (next && navigator.geolocation) {
        position = await new Promise((resolve) => navigator.geolocation.getCurrentPosition(
          ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude }),
          () => resolve({}),
          { enableHighAccuracy: false, timeout: 4500, maximumAge: 300000 },
        ))
      }
      await api.put('/veterinarios/status-online', { online: next, ...position })
      // Entrar em plantão registra a posição — a fila é recalculada a partir dela.
      if (next) carregarDados()
      setOnline(next)
      if (next) emitVeterinarioOnline()
      else emitVeterinarioOffline()
    } catch (requestError: any) {
      const dados = requestError.response?.data
      setPendencias(dados?.pendencias || [])
      setError(dados?.error || 'Não foi possível alterar sua disponibilidade.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  const aceitarSolicitacao = async (id: string) => {
    try {
      await api.put(`/solicitacoes/${id}/aceitar`)
      setSolicitacoesPendentes((previous) => previous.filter((item) => item.id !== id))
      navigate(`/veterinario/atendimento/${id}`)
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível aceitar a solicitação.')
    }
  }

  if (!veterinario && !error) return <main className="vet-app"><VetLoading label="Carregando seu painel" /></main>
  if (!veterinario) return <main className="vet-app"><div className="vet-app-main"><div className="vet-card vet-empty"><strong>{error}</strong><button className="vet-button--primary" onClick={carregarDados}>Tentar novamente</button></div></div></main>

  if (!veterinario.aprovado_admin) {
    return (
      <main className="vet-app"><div className="vet-app-main"><div className="vet-card vet-empty"><VetIcon name="clock" size={42} /><strong>Conta em análise</strong><p>Seu cadastro profissional precisa ser aprovado antes de receber atendimentos.</p><button className="vet-button--primary" onClick={logout}>Sair</button></div></div></main>
    )
  }

  return (
    <main className="vet-app">
      <header className="vet-home-header">
        <div className="vet-home-header__brand">
          <img src="/brand/logo-symbol.png" alt="" />
          <strong>Saúde Pet</strong>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <button className="vet-icon-button vet-icon-button--glass" type="button" onClick={() => setDrawerOpen(true)} aria-label="Abrir menu"><VetIcon name="menu" /></button>
          </div>
        </div>
        <div className="vet-home-profile">
          <VetAvatar user={veterinario.usuario} size="md" />
          <div>
            <p>Seja bem-vindo(a),</p>
            <h1>Dr(a). {veterinario.usuario.nome}</h1>
            <span className="vet-home-profile__rating"><VetIcon name="star" size={13} /> {Number(veterinario.avaliacao_media || 0).toFixed(1)} · {veterinario.total_atendimentos || 0} atendimentos</span>
          </div>
          <Link className="vet-balance" to="/veterinario/repasses" aria-label="Consultar saldo e repasses">
            <span>Saldo <VetIcon name="eye" size={12} /></span>
            <strong>{carteira ? formatMoney(carteira.saldo_disponivel) : 'Consultar'}</strong>
          </Link>
        </div>
        <button className={`vet-availability ${online ? 'is-online' : ''}`} type="button" onClick={toggleOnline} aria-pressed={online} disabled={updatingStatus}>
          <span className="vet-availability__inside"><VetIcon name="power" size={22} /><span><strong>{online ? 'DISPONÍVEL' : 'INDISPONÍVEL'}</strong><small>{updatingStatus ? 'Atualizando…' : online ? 'Toque para ficar offline' : 'Toque para ficar online'}</small></span><span className="vet-availability__dot" /></span>
        </button>
      </header>

      <div className="vet-app-main">
        {error && (
          <div className="vet-card vet-request" role="alert">
            {error}
            {pendencias.length > 0 && (
              <ul className="vet-pendencias">
                {pendencias.map((item) => (
                  <li key={item.campo}>
                    {item.onde
                      ? <Link to={item.onde}>{item.texto}</Link>
                      : <span>{item.texto}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {atendimentoAtivo && (
          <Link className="vet-card vet-request" to={`/veterinario/atendimento/${atendimentoAtivo.id}`}>
            <div className="vet-request__head"><span className="vet-service-icon"><VetIcon name="clock" /></span><div><strong>Atendimento em andamento</strong><small>{atendimentoAtivo.pet?.nome || 'Pet'} · {atendimentoAtivo.tutor?.nome || 'Tutor'} — toque para continuar</small></div></div>
          </Link>
        )}

        {online && <p className="vet-online-note">Você está online e recebendo solicitações</p>}

        {online && solicitacoesPendentes.filter((request) => !dispensados.includes(request.id)).map((request) => (
          <article key={request.id} className="vet-card vet-request">
            <div className="vet-request__head"><span className="vet-service-icon"><VetIcon name="document" /></span><div><strong>{request.pet?.nome || 'Novo atendimento'}</strong><small>{request.tutor?.nome || 'Tutor'} · {serviceLabel(request.tipo_atendimento)}</small>{request.distancia_label && <small className="vet-request__distancia"><VetIcon name="pin" size={12} /> {request.distancia_label} de você</small>}{request.tutor?.total_avaliacoes > 0 && <small className="vet-request__reputacao"><VetIcon name="star" size={12} className="is-filled" /> {Number(request.tutor.avaliacao_media).toFixed(1)} · {request.tutor.total_avaliacoes} {request.tutor.total_avaliacoes === 1 ? 'avaliação' : 'avaliações'} de colegas</small>}</div></div>
            {/* O que o tutor mandou junto do pedido. Aceitar sem ver a ferida
                era a regra até agora: o único caminho para arquivo era o chat,
                que só abre depois do aceite. */}
            {request.midias?.length > 0 && (
              <div className="vet-request__midias">
                <small>{request.midias.length} {request.midias.length === 1 ? 'arquivo enviado' : 'arquivos enviados'} pelo tutor</small>
                <ul>
                  {request.midias.slice(0, 4).map((midia: ApiPayload) => (
                    <li key={midia.id} title={midia.legenda || midia.nome_original}>
                      {midia.tipo === 'imagem' && midia.url ? (
                        <a href={midia.url} target="_blank" rel="noreferrer">
                          <img src={midia.url} alt={midia.legenda || 'Foto enviada pelo tutor'} loading="lazy" />
                        </a>
                      ) : (
                        <a href={midia.url || '#'} target="_blank" rel="noreferrer" className="vet-request__midia-arquivo">
                          <VetIcon name={midia.tipo === 'audio' ? 'clock' : 'document'} size={14} />
                          {midia.tipo}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="vet-request__actions"><button type="button" onClick={() => dispensarSolicitacao(request)}>Agora não</button><button type="button" onClick={() => aceitarSolicitacao(request.id)}>Aceitar</button></div>
          </article>
        ))}

        <nav className="vet-quick-actions" aria-label="Atalhos">
          <Link to="/veterinario/clientes"><span><VetIcon name="users" size={19} /></span>Clientes</Link>
          <Link to="/veterinario/mensagens"><span><VetIcon name="message" size={19} /></span>Mensagens</Link>
          <Link to="/veterinario/cobrancas"><span><VetIcon name="wallet" size={19} /></span>Cobranças</Link>
        </nav>

        <section className="vet-card vet-section-card">
          <div className="vet-section-card__title"><VetIcon name="history" size={18} /><h2>Histórico de atendimentos</h2><Link to="/veterinario/historico">Ver mais</Link></div>
          {historico.length ? historico.map((item) => (
            <div className="vet-history-mini" key={item.id}><span className="vet-history-mini__icon"><VetIcon name="document" size={18} /></span><span><strong>{item.pet?.nome || 'Pet'}</strong><small>{item.tutor?.nome || 'Tutor'}</small></span><span className="vet-history-mini__rating">{item.avaliacao ? `★ ${item.avaliacao.nota}/5` : 'Concluído'}</span></div>
          )) : <p className="vet-review-pending">Seus atendimentos finalizados aparecerão aqui.</p>}
        </section>
      </div>

      <VetBottomNav />
      <VetDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} veterinarian={veterinario} onLogout={logout} />
    </main>
  )
}
