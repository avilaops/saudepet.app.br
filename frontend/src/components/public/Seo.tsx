import type { ApiPayload } from '../../types/api'
import { useEffect } from 'react'

const ensureMeta = (selector: string, attrs: Record<string, any>) => {
  let element: Element | null = document.head.querySelector(selector)
  if (!element) {
    const el = document.createElement(attrs.tag || 'meta')
    document.head.appendChild(el)
    element = el
  }
  Object.entries(attrs).forEach(([key, value]) => {
    if (key !== 'tag' && value != null && element) {
      element.setAttribute(key, String(value))
    }
  })
  return element
}

export default function Seo({ title, description, path = '/', image = '/og-default.png', imageWidth = '1200', imageHeight = '630', imageType, type = 'website', jsonLd, noindex = false }: ApiPayload) {
  useEffect(() => {
    const base = (import.meta.env.VITE_PUBLIC_SITE_URL || window.location.origin).replace(/\/$/, '')
    const canonical = `${base}${path}`
    document.title = title
    ensureMeta('meta[name="description"]', { name: 'description', content: description })
    ensureMeta('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex,nofollow' : 'index,follow' })
    ensureMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    ensureMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    ensureMeta('meta[property="og:type"]', { property: 'og:type', content: type })
    ensureMeta('meta[property="og:url"]', { property: 'og:url', content: canonical })
    ensureMeta('meta[property="og:image"]', { property: 'og:image', content: image.startsWith('http') ? image : `${base}${image}` })
    ensureMeta('meta[property="og:image:width"]', { property: 'og:image:width', content: imageWidth })
    ensureMeta('meta[property="og:image:height"]', { property: 'og:image:height', content: imageHeight })
    if (imageType) ensureMeta('meta[property="og:image:type"]', { property: 'og:image:type', content: imageType })
    ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    ensureMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    ensureMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    ensureMeta('meta[name="twitter:image"]', { name: 'twitter:image', content: image.startsWith('http') ? image : `${base}${image}` })
    ensureMeta('link[rel="canonical"]', { tag: 'link', rel: 'canonical', href: canonical })
    // O HTML inicial pode vir renderizado pelo backend com JSON-LD próprio;
    // quando o React assume, o bloco do cliente substitui o do servidor.
    document.querySelectorAll('script[id^="server-page-json-ld"]').forEach((node) => node.remove())
    const old = document.getElementById('page-json-ld')
    old?.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.id = 'page-json-ld'
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(jsonLd)
      document.head.appendChild(script)
    }
    return () => document.getElementById('page-json-ld')?.remove()
  }, [title, description, path, image, imageWidth, imageHeight, imageType, type, jsonLd, noindex])
  return null
}
