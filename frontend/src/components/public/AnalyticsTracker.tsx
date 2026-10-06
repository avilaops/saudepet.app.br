import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../services/api'

const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function getAnalyticsSessionId() {
  let id = sessionStorage.getItem('sp_session_id')
  if (!id) { id = makeId(); sessionStorage.setItem('sp_session_id', id) }
  return id
}

export default function AnalyticsTracker() {
  const location = useLocation()
  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    if (['admin', 'super_admin'].includes(user?.tipo_usuario)) return
    let visitorId = localStorage.getItem('sp_visitor_id')
    if (!visitorId) { visitorId = makeId(); localStorage.setItem('sp_visitor_id', visitorId) }
    const params = new URLSearchParams(location.search)
    const payload = {
      anonymousVisitorId: visitorId,
      anonymousSessionId: getAnalyticsSessionId(),
      navigationId: makeId(),
      path: location.pathname,
      pageTitle: document.title,
      referrer: document.referrer || undefined,
      utmSource: params.get('utm_source') || undefined,
      utmMedium: params.get('utm_medium') || undefined,
      utmCampaign: params.get('utm_campaign') || undefined,
      utmContent: params.get('utm_content') || undefined,
      utmTerm: params.get('utm_term') || undefined,
      articleSlug: location.pathname.startsWith('/blog/') ? location.pathname.slice(6) : undefined
    }
    const timer = window.setTimeout(() => api.post('/public/analytics/page-view', payload).catch(() => {}), 400)
    return () => window.clearTimeout(timer)
  }, [location.pathname, location.search])
  return null
}
