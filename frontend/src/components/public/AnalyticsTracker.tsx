import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import api from '../../services/api'
import MeasurementScreen from '../MeasurementScreen'
import { analyticsAllowed, measurementEligibility } from '../../services/measurement'

const makeId = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`

export function getAnalyticsSessionId() {
  if (!analyticsAllowed()) return undefined
  try {
    let id = sessionStorage.getItem('sp_session_id')
    if (!id) { id = makeId(); sessionStorage.setItem('sp_session_id', id) }
    return id
  } catch { return undefined }
}

export default function AnalyticsTracker({ validDynamic = false }: { validDynamic?: boolean }) {
  const location = useLocation()
  useEffect(() => {
    let timer: number | undefined
    let sent = false
    const send = () => {
      if (!analyticsAllowed() || !measurementEligibility.canTrack(location.pathname, 'public') || sent) return
      try {
        const user = JSON.parse(localStorage.getItem('user') || 'null')
        if (['admin', 'super_admin'].includes(user?.tipo_usuario)) return
        let visitorId = localStorage.getItem('sp_visitor_id')
        if (!visitorId) { visitorId = makeId(); localStorage.setItem('sp_visitor_id', visitorId) }
        const params = new URLSearchParams(location.search)
        const campaign = (key: string) => {
          const value = params.get(key)
          return value && /^[a-zA-Z0-9._-]{1,80}$/.test(value) && !/\d{9,}/.test(value) ? value : undefined
        }
        let referrer: string | undefined
        try {
          const ref = new URL(document.referrer)
          if (['http:', 'https:'].includes(ref.protocol) && ref.hostname !== window.location.hostname && !ref.hostname.endsWith('.avilaops.com') && ref.hostname !== 'auth.avilaops.com' && !ref.username && !ref.password) referrer = ref.origin
        } catch { /* no external origin */ }
        const payload = {
          anonymousVisitorId: visitorId,
          anonymousSessionId: getAnalyticsSessionId(),
          navigationId: makeId(),
          path: location.pathname,
          pageTitle: 'Saúde PET • público',
          referrer,
          utmSource: campaign('utm_source'),
          utmMedium: campaign('utm_medium'),
          utmCampaign: campaign('utm_campaign'),
          utmContent: campaign('utm_content'),
          utmTerm: campaign('utm_term'),
          articleSlug: location.pathname.startsWith('/blog/') ? location.pathname.slice(6) : undefined
        }
        sent = true
        void api.post('/public/analytics/page-view', payload).catch(() => {})
      } catch { /* Metrics and storage failures must not interrupt the page. */ }
    }
    const schedule = () => {
      window.clearTimeout(timer)
      if (analyticsAllowed()) timer = window.setTimeout(send, 400)
    }
    schedule()
    document.addEventListener('zarazConsentAPIReady', schedule)
    document.addEventListener('zarazConsentChoicesUpdated', schedule)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('zarazConsentAPIReady', schedule)
      document.removeEventListener('zarazConsentChoicesUpdated', schedule)
    }
  }, [location.pathname, location.search, validDynamic])
  return <MeasurementScreen area="public" validDynamic={validDynamic} />
}
