import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetAvatar, VetBottomNav, VetIcon, VetLoading, VetPageHeader } from '../../components/veterinario/VetUI'
import { useMeuPlano } from '../../components/veterinario/VetCrm'

const ordens = [['recentes', 'Mais recentes'], ['antigos', 'Há mais tempo sem vir'], ['frequentes', 'Mais frequentes']]

const diasLabel = (dias: ApiPayload) => {
  if (dias === null || dias === undefined) return 'Sem atendimento fechado'
  if (dias === 0) return 'Atendido hoje'
  if (dias === 1) return 'Atendido ontem'
  return `Há ${dias} dias`
}

export default function VetClientes() {
  const navigate = useNavigate()
  const { plano } = useMeuPlano()
  const [clientes, setClientes] = useState<ApiPayload[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [busca, setBusca] = useState('')
  const [tag, setTag] = useState('')
  const [tags, setTags] = useState<ApiPayload[]>([])
  const [favoritos, setFavoritos] = useState(false)
  const [ordem, setOrdem] = useState('recentes')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const buscaTimer = useRef<any>(null)

  const carregar = useCallback(async (proximaPagina = 1, acumular = false) => {
    setLoading(true); setError('')
    try {
      const params = new URLSearchParams({ pagina: String(proximaPagina), ordem })
      if (busca.trim()) params.set('busca', busca.trim())
      if (tag) params.set('tag', tag)
      if (favoritos) params.set('favoritos', '1')
      const response = await api.get(`/v1/veterinario/crm/clientes?${params}`)
      setTotal(response.data?.total || 0)
      setPagina(proximaPagina)
      setClientes((atuais) => acumular ? [...atuais, ...(response.data?.clientes || [])] : (response.data?.clientes || []))
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar seus clientes.')
    } finally { setLoading(false) }
  }, [busca, tag, favoritos, ordem])

  // Busca com pausa de digitação; filtros recarregam na hora.
  useEffect(() => {
    clearTimeout(buscaTimer.current)
    buscaTimer.current = setTimeout(() => carregar(1), busca ? 350 : 0)
    return () => clearTimeout(buscaTimer.current)
  }, [carregar, busca])

  useEffect(() => {
    api.get('/v1/veterinario/crm/clientes/tags')
      .then((response) => setTags(response.data?.tags || []))
      .catch(() => {})
  }, [])

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Meus clientes"
        subtitle={plano ? `Plano ${plano.nome}` : 'Sua clientela na plataforma'}
        onBack={() => navigate('/veterinario/home')}
      />
      <div className="vet-app-main">
        <nav className="vet-quick-actions" aria-label="Ferramentas do consultório">
          <Link to="/veterinario/crm/agenda"><span><VetIcon name="calendar" size={19} /></span>Agenda</Link>
          <Link to="/veterinario/crm/retencao"><span><VetIcon name="bell" size={19} /></span>Retenção</Link>
          <Link to="/veterinario/crm/painel"><span><VetIcon name="chart" size={19} /></span>Relatórios</Link>
        </nav>

        <div className="vet-crm-filters">
          <input
            className="input"
            type="search"
            placeholder="Buscar por nome, e-mail ou apelido"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
            aria-label="Buscar cliente"
          />
          <div className="vet-crm-filters__row">
            <select className="input" value={ordem} onChange={(event) => setOrdem(event.target.value)} aria-label="Ordenar clientes">
              {ordens.map(([valor, label]) => <option key={valor} value={valor}>{label}</option>)}
            </select>
            <button
              className={`vet-tab ${favoritos ? 'is-active' : ''}`}
              type="button"
              onClick={() => setFavoritos((atual) => !atual)}
              aria-pressed={favoritos}
            >
              <VetIcon name="star" size={14} /> Favoritos
            </button>
          </div>
          {tags.length > 0 && (
            <div className="vet-crm-tags" role="group" aria-label="Filtrar por tag">
              {tags.map(({ tag: nome, total: quantos }) => (
                <button
                  key={nome}
                  type="button"
                  className={`vet-crm-tag ${tag === nome ? 'is-active' : ''}`}
                  onClick={() => setTag((atual) => atual === nome ? '' : nome)}
                >
                  {nome} <small>{quantos}</small>
                </button>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="vet-card vet-request" role="alert">
            <strong>{error}</strong>
            <button className="vet-button--primary vet-request__retry" type="button" onClick={() => carregar(1)}>
              Tentar novamente
            </button>
          </div>
        )}
        {loading && clientes.length === 0 ? <VetLoading label="Carregando clientes" /> : (
          <section className="vet-list" aria-label={`${total} clientes`}>
            {clientes.length === 0 ? (
              <div className="vet-card vet-empty">
                <VetIcon name="users" size={38} />
                <strong>{busca || tag || favoritos ? 'Nenhum cliente neste filtro' : 'Sua clientela nasce dos atendimentos'}</strong>
                {!busca && !tag && !favoritos && <p>Cada atendimento finalizado — e cada consulta que você marcar na agenda — entra aqui sozinho.</p>}
              </div>
            ) : clientes.map((cliente) => (
              <button
                key={cliente.id}
                type="button"
                className="vet-card vet-crm-cliente"
                onClick={() => navigate(`/veterinario/clientes/${cliente.tutor.id}`)}
              >
                <VetAvatar user={cliente.tutor} size="md" />
                <span className="vet-crm-cliente__info">
                  <strong>
                    {cliente.apelido || cliente.tutor.nome}
                    {cliente.favorito && <VetIcon name="star" size={13} className="vet-crm-cliente__star" />}
                  </strong>
                  <small>{cliente.tutor.pets?.length ? cliente.tutor.pets.map((pet: ApiPayload) => pet.nome).join(', ') : 'Sem pets cadastrados'}</small>
                  {cliente.tags?.length > 0 && (
                    <span className="vet-crm-tags vet-crm-tags--inline">
                      {cliente.tags.map((nome: ApiPayload) => <span key={nome} className="vet-crm-tag is-static">{nome}</span>)}
                    </span>
                  )}
                </span>
                <span className="vet-crm-cliente__meta">
                  <strong>{cliente.total_atendimentos}</strong>
                  <small>{cliente.total_atendimentos === 1 ? 'atendimento' : 'atendimentos'}</small>
                  <small className={cliente.dias_sem_atendimento > 180 ? 'is-alerta' : ''}>{diasLabel(cliente.dias_sem_atendimento)}</small>
                </span>
              </button>
            ))}
            {clientes.length < total && (
              <button className="vet-button--secondary" type="button" disabled={loading} onClick={() => carregar(pagina + 1, true)}>
                {loading ? 'Carregando…' : `Carregar mais (${clientes.length} de ${total})`}
              </button>
            )}
          </section>
        )}
      </div>
      <VetBottomNav />
    </main>
  )
}
