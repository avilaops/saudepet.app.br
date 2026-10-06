import type { ApiPayload } from '../../types/api'
import { useCallback, useEffect, useState } from 'react'
import api from '../../services/api'
import { VetBottomNav, VetIcon, VetLoading, VetPageHeader, formatMoney, serviceLabel } from '../../components/veterinario/VetUI'

// Estatísticas do veterinário com números reais do backend (PaymentSplit e
// avaliações). A versão anterior desenhava um gráfico com meses escritos à
// mão ("11/25"…) e valores fixos em zero por cima de qualquer dado real.
export default function VetEstatisticas() {
  const [dados, setDados] = useState<ApiPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data } = await api.get('/veterinarios/estatisticas')
      setDados(data)
    } catch (requestError: any) {
      setError(requestError.response?.data?.error || 'Não foi possível carregar suas estatísticas.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { carregar() }, [carregar])

  const maiorMes = dados ? Math.max(...(dados.faturamento_por_mes || []).map((mes: ApiPayload) => mes.valor), 1) : 1

  return (
    <main className="vet-app">
      <VetPageHeader
        compact
        title="Minhas estatísticas"
        subtitle="Atendimentos, avaliações e ganhos reais"
        action={<button className="vet-icon-button" type="button" onClick={carregar} aria-label="Atualizar"><VetIcon name="refresh" size={18} /></button>}
      />
      <div className="vet-app-main">
        {loading && <VetLoading label="Carregando estatísticas" />}
        {!loading && error && (
          <div className="vet-card vet-empty">
            <VetIcon name="chart" size={38} />
            <strong>{error}</strong>
            <button className="vet-button--primary" type="button" onClick={carregar}>Tentar novamente</button>
          </div>
        )}
        {!loading && !error && dados && (
          <>
            <div className="vet-balance-grid">
              <div className="vet-card vet-balance-card"><VetIcon name="document" size={18} /><strong>{dados.totalAtendimentos || 0}</strong><small>Atendimentos</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="star" size={18} /><strong>{dados.avaliacaoMedia != null ? Number(dados.avaliacaoMedia).toFixed(1) : '—'}</strong><small>{dados.totalAvaliacoes || 0} {dados.totalAvaliacoes === 1 ? 'avaliação' : 'avaliações'}</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="wallet" size={18} /><strong>{formatMoney(dados.financeiro?.total_recebido)}</strong><small>Total recebido</small></div>
              <div className="vet-card vet-balance-card"><VetIcon name="chart" size={18} /><strong>{formatMoney(dados.financeiro?.recebido_no_mes)}</strong><small>Neste mês</small></div>
            </div>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="chart" size={18} /><h2>Ganhos por mês</h2></div>
              {(dados.faturamento_por_mes || []).every((mes: ApiPayload) => mes.valor === 0) ? (
                <p className="vet-review-pending">Seus recebimentos aparecerão aqui após o primeiro atendimento pago.</p>
              ) : (
                <div className="vet-crm-grafico" role="img" aria-label="Gráfico de ganhos mensais">
                  {dados.faturamento_por_mes.map((mes: ApiPayload) => (
                    <div className="vet-crm-grafico__coluna" key={mes.mes}>
                      <small>{mes.valor > 0 ? formatMoney(mes.valor) : ''}</small>
                      <span style={{ height: `${Math.max((mes.valor / maiorMes) * 100, 2)}%` }} />
                      <strong>{mes.rotulo}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="star" size={18} /><h2>Distribuição das avaliações</h2></div>
              {!dados.totalAvaliacoes ? (
                <p className="vet-review-pending">Você ainda não recebeu avaliações.</p>
              ) : (
                (dados.distribuicaoAvaliacoes || []).map((linha: ApiPayload) => (
                  <div className="vet-crm-barra" key={linha.nota}>
                    <small>{linha.nota}★</small>
                    <div><span style={{ width: `${linha.percentual}%` }} /></div>
                    <small>{linha.total}</small>
                  </div>
                ))
              )}
            </section>

            <section className="vet-card vet-section-card">
              <div className="vet-section-card__title"><VetIcon name="document" size={18} /><h2>Tipos de atendimento</h2></div>
              {!dados.atendimentos_por_tipo?.total ? (
                <p className="vet-review-pending">Nenhum atendimento registrado ainda.</p>
              ) : (
                dados.atendimentos_por_tipo.tipos.map((linha: ApiPayload) => (
                  <div className="vet-crm-barra" key={linha.tipo}>
                    <small>{serviceLabel(linha.tipo)}</small>
                    <div><span style={{ width: `${linha.percentual}%` }} /></div>
                    <small>{linha.percentual}%</small>
                  </div>
                ))
              )}
            </section>
          </>
        )}
      </div>
      <VetBottomNav />
    </main>
  )
}
