import { createContext } from 'react'

/** O que cada página declara no `<Seo>`; o servidor escreve isso no `<head>`. */
export interface SeoDaPagina {
  title: string
  description: string
  path: string
  image?: string
  imageWidth?: string
  imageHeight?: string
  imageType?: string
  type?: string
  jsonLd?: unknown
  noindex?: boolean
}

/**
 * No servidor não há `document` para o `<Seo>` alterar. Ele anota aqui o que a
 * página pediu, e quem desenhou a página devolve a anotação junto com o HTML.
 */
export const ColetorDeSeo = createContext<{ seo: SeoDaPagina | null } | null>(null)
