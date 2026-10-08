import { createContext, useContext, type ReactNode } from 'react'

/**
 * Dados que a página já recebe prontos, sem esperar a API.
 *
 * As páginas públicas são desenhadas duas vezes com o mesmo `.tsx`: uma no
 * servidor (`entry-server.tsx`), para o Google, a prévia de link do WhatsApp e
 * a primeira pintura; outra no navegador, quando o React assume. Para as duas
 * saírem iguais, o servidor entrega junto com o HTML as respostas da API que a
 * página pediria — e a página começa por elas em vez de começar vazia.
 *
 * A chave é o endereço da própria API (`/public/blog/meu-artigo`), montado por
 * `chaveDoDado`. O backend monta a mesma chave em `ssr.service.ts`: mudou de
 * um lado, muda do outro.
 */
export type DadosIniciais = Record<string, unknown>

/** O que o servidor grava quando o recurso não existe (artigo fora do ar, loja removida). */
export const NAO_ENCONTRADO = { __naoEncontrado: true } as const

const ID_DO_SCRIPT = 'dados-iniciais'

const Contexto = createContext<DadosIniciais | null>(null)

let lidosDoDocumento: DadosIniciais | null = null

/** No navegador os dados vêm num `<script type="application/json">` do HTML inicial. */
function dadosDoDocumento(): DadosIniciais {
  if (lidosDoDocumento) return lidosDoDocumento
  lidosDoDocumento = {}
  if (typeof document === 'undefined') return lidosDoDocumento
  try {
    const texto = document.getElementById(ID_DO_SCRIPT)?.textContent
    if (texto) lidosDoDocumento = JSON.parse(texto) as DadosIniciais
  } catch {
    // HTML inicial sem dados (ou ilegível): a página busca na API, como sempre.
  }
  return lidosDoDocumento
}

export function ProvedorDeDadosIniciais({ dados, children }: { dados: DadosIniciais; children: ReactNode }) {
  return <Contexto.Provider value={dados}>{children}</Contexto.Provider>
}

/** `/public/blog` + `{ page: 1, limit: 9 }` → `/public/blog?limit=9&page=1`. */
export function chaveDoDado(caminho: string, parametros?: Record<string, unknown>): string {
  const pares = Object.entries(parametros || {})
    .filter(([, valor]) => valor !== undefined && valor !== null && valor !== '')
    .map(([nome, valor]) => `${nome}=${String(valor)}`)
    .sort()
  return pares.length ? `${caminho}?${pares.join('&')}` : caminho
}

export interface DadoInicial<T> {
  /** A resposta da API, quando veio junto com o HTML. */
  dado: T | undefined
  /** O servidor procurou e o recurso não existe. */
  naoEncontrado: boolean
  /** Veio alguma coisa (dado ou "não existe"): não precisa buscar de novo. */
  veioPronto: boolean
}

/** Devolve uma função: a mesma página pode precisar de mais de uma chave. */
export function useDadosIniciais(): <T>(chave: string) => DadoInicial<T> {
  const doContexto = useContext(Contexto)
  return <T,>(chave: string): DadoInicial<T> => {
    const dados = doContexto ?? dadosDoDocumento()
    if (!(chave in dados)) return { dado: undefined, naoEncontrado: false, veioPronto: false }
    const valor = dados[chave]
    const naoEncontrado = Boolean(valor && typeof valor === 'object' && '__naoEncontrado' in valor)
    return { dado: naoEncontrado ? undefined : (valor as T), naoEncontrado, veioPronto: true }
  }
}
