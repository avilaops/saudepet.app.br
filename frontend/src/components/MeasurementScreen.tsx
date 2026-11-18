import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { measurementEligibility, startSiteMeasurement } from '../services/measurement'

/** Mount inside a valid public page or the authorized branch of PrivateRoute. */
export default function MeasurementScreen({ area, validDynamic = false }: { area: 'public' | 'application'; validDynamic?: boolean }) {
  const { pathname } = useLocation()
  useEffect(() => {
    const release = measurementEligibility.mount(pathname, area, validDynamic)
    const refresh = () => { void startSiteMeasurement() }
    refresh()
    document.addEventListener('zarazConsentAPIReady', refresh)
    document.addEventListener('zarazConsentChoicesUpdated', refresh)
    return () => {
      release()
      window.__avilaMeasurement?.refresh()
      document.removeEventListener('zarazConsentAPIReady', refresh)
      document.removeEventListener('zarazConsentChoicesUpdated', refresh)
    }
  }, [pathname, area, validDynamic])
  return null
}
