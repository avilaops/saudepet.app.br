import { createMeasurementEligibility } from './measurement-policy'

type RouteArea = 'public' | 'application'
type Measurement = { refresh(): void; track(name: string, input?: Record<string, unknown>): boolean }
declare global {
  interface Window {
    __avilaMeasurement?: Measurement
    zaraz?: { consent?: { APIReady?: boolean; getAll(): { analytics?: boolean } } }
  }
}

export const measurementEligibility = createMeasurementEligibility()

export function analyticsAllowed() {
  try { return window.zaraz?.consent?.APIReady === true && window.zaraz.consent.getAll().analytics === true }
  catch { return false }
}

/** First-party modules do not request Google until the CMP and rendered route permit it. */
export async function startSiteMeasurement() {
  try {
    const modulePath = '/measurement/zaraz.mjs'
    const module = await import(/* @vite-ignore */ modulePath)
    await module.startZarazMeasurement({ canTrack: (route: { area: RouteArea }) => measurementEligibility.canTrack(location.pathname, route.area) })
    window.__avilaMeasurement?.refresh()
  } catch { /* A metrics outage must never interrupt care, login or navigation. */ }
}

export function trackConfirmedContact() {
  window.__avilaMeasurement?.track('form_submitted', { form_type: 'contato' })
}
