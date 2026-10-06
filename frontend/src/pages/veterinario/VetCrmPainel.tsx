import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../services/api'
import { VetAvatar, VetIcon, VetLoading, VetPageHeader, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'
import { CrmUpgrade, ehFaltaDePlano } from '../../components/veterinario/VetCrm'

export default function VetCrmPainel() {
  const navigate = useNavigate()
  const [dados, setDados] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [bloqueado, setBloqueado] = useState(false)
  const [error, setError] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true); setError(''); setBloqueado(false)
    try {
      const response = await api.get('/v1/veterinario/crm/painel')
      setDados(response.data)
    } catch (requestError: any) {
      if (ehFaltaDePlano(requestError)) setBloqueado(true)
      else setError(requestError.response?.data?.error || 'Não foi possível carregar os relatórios.')
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const maiorMes = dados ? Math.max(...(dados.faturamento_por_mes || []).map((mes: ApiPayload) => mes.valor), 1) : 1

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Relatórios do consultório"
        subtitle="Faturamento, clientela e avaliações"
        onBack={() => navigate('/veterinario/clientes')}
        action={<button className="vet-icon-button" type="button" onClick={carregar} aria-label="Atualizar"><VetIcon name="refresh" size={18} /></button>}
      />
      <div className="vet-app-main">
        {loading && <VetLoading label="Carregando relatórios" />}
        {!loading && bloqueado && (
          <CrmUpgrade
            titulo="Relatórios são de plano pago"
            descricao="Faturamento por mês e por cliente, distribuição das avaliações e mix de atendimentos — tudo a partir dos seus números reais."
          />
        )}
        {!loading && error && <p className="vet-card vet-request" role="alert">{error}</p>}
        {!loading && dados && (
          <>
            <div className="vet-balance-grid">
              <div className="vet-card vet-balance-card"><VetIcon name="wallet" size={18} /><strong>{formatMoney(dados.financeiro?.total_recebido)}</strong><small>Total recebido</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="chart" size={18} /><strong>{formatMoney(dados.financeiro?.recebido_no_mes)}</strong><small>Neste mês</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="clock" size={18} /><strong>{formatMoney(dados.financeiro?.total_pendente)}</strong><small>A receber</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="document" size={18} /><strong>{formatMoney(dados.financeiro?.ticket_medio)}</strong><small>Ticket médio</small></div>
            </div>

            <div className="vet-balance-grid">
              <div className="vet-card vet-balance-card"><VetIcon name="users" size={18} /><strong>{dados.total_clientes}</strong><small>Clientes</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="calendar" size={18} /><strong>{dados.agendamentos_futuros}</strong><small>Consultas futuras</small></div>
            </div>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="chart" size={18} /><h2>Faturamento por mês</h2></div>
              <div className="vet-crm-grafico" role="img" aria-label="Gráfico de faturamento mensal">
                {(dados.faturamento_por_mes || []).map((mes: ApiPayload) => (
                  <div className="vet-crm-grafico__coluna" key={mes.mes}>
                    <small>{mes.valor > 0 ? formatMoney(mes.valor) : ''}</small>
                    <span style={{ height: `${Math.max((mes.valor / maiorMes) * 100, 2)}%` }} />
                    <strong>{mes.rotulo}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="star" size={18} /><h2>Avaliações</h2></div>
              {!dados.avaliacoes?.total ? <p className="vet-review-pending">Você ainda não recebeu avaliações.</p> : (
                <>
                  <p className="vet-crm-media">★ {dados.avaliacoes?.media} <small>({dados.avaliacoes?.total} {dados.avaliacoes?.total === 1 ? 'avaliação' : 'avaliações'})</small></p>
                  {(dados.avaliacoes?.distribuicao || []).map((linha: ApiPayload) => (
                    <div className="vet-crm-barra" key={linha.nota}>
                      <small>{linha.nota}★</small>
                      <div><span style={{ width: `${linha.percentual}%` }} /></div>
                      <small>{linha.total}</small>
                    </div>
                  ))}
                </>
              )}
            </section>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="users" size={18} /><h2>Quem sustenta a agenda</h2></div>
              {!dados.melhores_clientes?.length ? <p className="vet-review-pending">Sem pagamentos registrados ainda.</p> : (dados.melhores_clientes || []).map((linha: ApiPayload) => (
                <div className="vet-history-mini" key={linha.tutor.id}>
                  <VetAvatar user={linha.tutor} size="sm" />
                  <span><strong>{linha.tutor.nome}</strong><small>{linha.pagamentos} {linha.pagamentos === 1 ? 'pagamento' : 'pagamentos'}</small></span>
                  <span className="vet-history-mini__rating">{formatMoney(linha.total)}</span>
                </div>
              ))}
            </section>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="document" size={18} /><h2>Tipos de atendimento</h2></div>
              {!dados.atendimentos_por_tipo?.total ? <p className="vet-review-pending">Nenhum atendimento registrado.</p> : (dados.atendimentos_por_tipo?.tipos || []).map((linha: ApiPayload) => (
                <div className="vet-crm-barra" key={linha.tipo}>
                  <small>{serviceLabel(linha.tipo)}</small>
                  <div><span style={{ width: `${linha.percentual}%` }} /></div>
                  <small>{linha.percentual}%</small>
                </div>
              ))}
            </section>
          </>
        )}
      </div>
    </main>
  )
}
