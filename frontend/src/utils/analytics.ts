type Registro = Record<string, unknown>

export interface AnalyticsNormalizado {
  period: unknown
  totals: {
    pageViews: number
    approximateVisitors: number
    sessions: number
    leads: number
    convertedLeads: number
    conversionRate: number
  }
  comparison: unknown
  funnel?: Array<{ etapa: string; valor: number }>
  daily: Array<{ date: string; views: number }>
  topPages: Registro[]
  sources: Registro[]
  campaigns: Registro[]
  devices: Registro[]
  articles: Registro[]
}

const objeto = (value: unknown): Registro => value !== null && typeof value === 'object' ? value as Registro : {}
const numberOrZero = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0
const arrayOrEmpty = (value: unknown): Registro[] => Array.isArray(value) ? value.filter((item): item is Registro => item !== null && typeof item === 'object') : []

const dailyOrEmpty = (value: unknown): AnalyticsNormalizado['daily'] => arrayOrEmpty(value).map((item) => ({
  date: String(item.date || ''),
  views: numberOrZero(item.views)
}))

const funnelOrUndefined = (value: unknown): AnalyticsNormalizado['funnel'] => {
  if (!Array.isArray(value)) return undefined
  return arrayOrEmpty(value).map((item) => ({ etapa: String(item.etapa || ''), valor: numberOrZero(item.valor) }))
}

export function normalizeAnalyticsPayload(payload: unknown): AnalyticsNormalizado {
  const source = objeto(payload)
  const totals = objeto(source.totals)

  return {
    period: source.period || null,
    totals: {
      pageViews: numberOrZero(totals.pageViews),
      approximateVisitors: numberOrZero(totals.approximateVisitors),
      sessions: numberOrZero(totals.sessions),
      leads: numberOrZero(totals.leads),
      convertedLeads: numberOrZero(totals.convertedLeads),
      conversionRate: numberOrZero(totals.conversionRate)
    },
    comparison: source.comparison || { pageViews: 0, leads: 0 },
    funnel: funnelOrUndefined(source.funnel),
    daily: dailyOrEmpty(source.daily),
    topPages: arrayOrEmpty(source.topPages),
    sources: arrayOrEmpty(source.sources),
    campaigns: arrayOrEmpty(source.campaigns),
    devices: arrayOrEmpty(source.devices),
    articles: arrayOrEmpty(source.articles)
  }
}
