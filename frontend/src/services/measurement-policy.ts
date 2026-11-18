type Area = 'public' | 'application'
const publicPaths = new Set(['/', '/faq', '/contato', '/blog', '/privacidade', '/mercado', '/login', '/register', '/cadastrar'])
const dynamicPublic = /^\/(blog\/[^/]+|mercado\/[^/]+(?:\/[^/]+)?)\/?$/

/** Holds only mounted route leases in memory, never user or pet records. */
export function createMeasurementEligibility() {
  const screens = new Set<{ path: string; area: Area }>()
  return {
    mount(path: string, area: Area, validDynamic = false) {
      const normalized = path.replace(/\/+$/, '') || '/'
      if (area === 'public' && !publicPaths.has(normalized) && !(validDynamic && dynamicPublic.test(normalized))) return () => {}
      const screen = { path, area }
      screens.add(screen)
      return () => { screens.delete(screen) }
    },
    canTrack(path: string, area: Area) {
      return [...screens].some(screen => screen.path === path && screen.area === area)
    }
  }
}
