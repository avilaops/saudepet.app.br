/**
 * Endereço público do site, sem barra no fim.
 *
 * No navegador é a própria origem. No servidor não existe `window`: quem
 * desenha a página (`entry-server.tsx`) informa o endereço antes de começar.
 */
let baseNoServidor = 'https://saudepet.app.br'

export function definirBaseDoSite(base: string) {
  if (base) baseNoServidor = base.replace(/\/$/, '')
}

export function baseDoSite(): string {
  const configurada = import.meta.env.VITE_PUBLIC_SITE_URL as string | undefined
  const base = configurada || (typeof window !== 'undefined' ? window.location.origin : baseNoServidor)
  return base.replace(/\/$/, '')
}
