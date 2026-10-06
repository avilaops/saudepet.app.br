import type { ApiPayload } from '../../types/api'
import { useEffect, useState } from 'react'
import AdminContentNav from '../../components/admin/AdminContentNav'
import { Aviso, Campo, Painel, entrada } from '../../components/admin/AdminUI'
import api from '../../services/api'
import { normalizeAnalyticsPayload } from '../../utils/analytics'

export default function AdminAnalytics() {
  const [range, setRange] = useState('30d')
  const [custom, setCustom] = useState<ApiPayload>({ from: '', to: '' })
  const [data, setData] = useState<ApiPayload | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (range === 'custom' && (!custom.from || !custom.to)) return
    setError('')
    const params = {
      range,
      ...(range === 'custom'
        ? { from: new Date(`${custom.from}T00:00:00`).toISOString(), to: new Date(`${custom.to}T23:59:59`).toISOString() }
        : {}),
    }
    api.get('/admin/content/analytics', { params })
      .then((response) => setData(normalizeAnalyticsPayload(response.data)))
      .catch(() => setError('Não foi possível carregar as métricas. Verifique a conexão e tente novamente.'))
  }, [range, custom.from, custom.to])

  const max = (data?.daily || []).reduce((highest: number, item: ApiPayload) => Math.max(highest, Number(item?.views) || 0), 1)
  const cards = data
    ? [
        ['Visualizações', data.totals.pageViews],
        ['Visitantes aprox.', data.totals.approximateVisitors],
        ['Sessões', data.totals.sessions],
        ['Leads', data.totals.leads],
        ['Conversões', data.totals.convertedLeads],
        ['Taxa de conversão', `${data.totals.conversionRate}%`],
      ]
    : []

  return (
    <div>
      <AdminContentNav title="Métricas" subtitle="Tráfego, funil e origem dos leads no período selecionado." />

      <div className="space-y-6">
        <Painel>
          <div className="flex flex-wrap items-end gap-4">
            <Campo rotulo="Período" className="w-full sm:w-52">
              <select value={range} onChange={(e) => setRange(e.target.value)} className={entrada}>
                <option value="today">Hoje</option>
                <option value="7d">Últimos 7 dias</option>
                <option value="30d">Últimos 30 dias</option>
                <option value="custom">Personalizado</option>
              </select>
            </Campo>
            {range === 'custom' && (
              <>
                <Campo rotulo="De" className="w-full sm:w-44">
                  <input
                    type="date"
                    value={custom.from}
                    onChange={(e) => setCustom({ ...custom, from: e.target.value })}
                    className={entrada}
                  />
                </Campo>
                <Campo rotulo="Até" className="w-full sm:w-44">
                  <input
                    type="date"
                    value={custom.to}
                    onChange={(e) => setCustom({ ...custom, to: e.target.value })}
                    className={entrada}
                  />
                </Campo>
              </>
            )}
          </div>
        </Painel>

        {error && <Aviso>{error}</Aviso>}

        {!data ? (
          <p role="status" className="rounded-2xl border border-slate-200 bg-white px-6 py-12 text-center text-xs font-bold text-slate-400">
            Carregando dados reais…
          </p>
        ) : (
          <>
            <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
              {cards.map(([label, value]) => (
                <article key={label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <span className="block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</span>
                  <strong className="mt-1 block text-2xl font-black tabular-nums text-slate-900">{value}</strong>
                </article>
              ))}
            </section>

            {data.funnel && (
              <Painel titulo="Funil de conversão">
                <div className="grid gap-3">
                  {data.funnel.map((etapa: ApiPayload, i: number) => {
                    const topo = data.funnel[0]?.valor || 0
                    const anterior = i > 0 ? data.funnel[i - 1].valor : null
                    const largura = topo ? Math.max(2, (etapa.valor / topo) * 100) : 2
                    const taxa = anterior ? (anterior > 0 ? Math.round((etapa.valor / anterior) * 1000) / 10 : 0) : null
                    return (
                      <div key={etapa.etapa}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
                          <span className="font-bold text-slate-700">{etapa.etapa}</span>
                          <span className="text-slate-500">
                            <strong className="font-black tabular-nums text-slate-900">{etapa.valor}</strong>
                            {taxa !== null && <span className="ml-2 text-[11px] text-slate-400">{taxa}% da etapa anterior</span>}
                          </span>
                        </div>
                        <div className="h-3.5 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{ width: `${largura}%`, background: `hsl(${170 - i * 18} 65% 42%)` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="mt-3 text-[11px] text-slate-400">
                  Da visita ao atendimento finalizado, no período selecionado. Cada barra é proporcional ao topo do funil.
                </p>
              </Painel>
            )}

            <Painel titulo="Visualizações por dia">
              <div className="flex h-60 items-end gap-2 border-b border-slate-200" aria-label="Gráfico de visualizações por dia">
                {data.daily.map((item: ApiPayload) => (
                  <div
                    key={item.date}
                    title={`${item.date}: ${item.views}`}
                    className="flex h-full min-w-[7px] flex-1 flex-col items-center justify-end"
                  >
                    <i
                      className="block w-[72%] rounded-t bg-teal-500"
                      style={{ height: `${Math.max(3, (item.views / max) * 100)}%` }}
                    />
                    <small className="my-1 hidden text-[10px] text-slate-400 sm:block">{item.date.slice(5)}</small>
                  </div>
                ))}
              </div>
            </Painel>

            <div className="grid gap-6 lg:grid-cols-2">
              <Rank title="Páginas mais acessadas" rows={data.topPages} label="path" value="views" />
              <Rank title="Principais origens" rows={data.sources} label="source" value="sessions" />
              <Rank title="Campanhas que geraram leads" rows={data.campaigns} label="campaign" value="leads" />
              <Rank title="Dispositivos" rows={data.devices} label="device" value="views" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Rank({ title, rows = [], label, value }: ApiPayload) {
  return (
    <Painel titulo={title}>
      {rows.length ? (
        <ol className="divide-y divide-slate-100">
          {rows.map((row: ApiPayload, index: number) => (
            <li key={`${row?.[label] || 'item'}-${index}`} className="flex items-center justify-between gap-4 py-2.5 text-xs">
              <span className="min-w-0 truncate font-medium text-slate-600">{row?.[label] || 'Não identificado'}</span>
              <strong className="shrink-0 font-black tabular-nums text-slate-900">{Number(row?.[value]) || 0}</strong>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-xs font-medium text-slate-400">Sem dados no período.</p>
      )}
    </Painel>
  )
}
