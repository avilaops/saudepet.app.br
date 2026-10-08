import { baseDoSite } from '../ssr/site'

export function responsiveBlogImageSet(url?: string | null): string | undefined {
  if (!url?.endsWith('.webp')) return undefined
  const base = url.slice(0, -5)
  return `${base}-640.webp 640w, ${base}-960.webp 960w, ${url} 1280w`
}

export function absoluteSiteUrl(url: string): string
export function absoluteSiteUrl(url: null): null
export function absoluteSiteUrl(url: undefined): undefined
export function absoluteSiteUrl(url?: string | null): string | null | undefined {
  if (!url || url.startsWith('http')) return url
  const base = baseDoSite()
  return `${base}${url.startsWith('/') ? url : `/${url}`}`
}
