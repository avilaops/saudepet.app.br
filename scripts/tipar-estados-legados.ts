/**
 * Codemod único da migração JSX -> TSX.
 *
 * React infere `never[]` para `useState([])` e `null` para `useState(null)`.
 * Nas telas legadas esses estados recebem respostas JSON depois da montagem.
 * O codemod explicita somente essa fronteira e importa `ApiPayload`; não toca
 * estados que já possuem tipo e não adiciona `ts-ignore`/`ts-nocheck`.
 *
 * Uso: npx tsx scripts/tipar-estados-legados.ts
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'

const raiz = path.resolve('frontend/src')
const contrato = path.join(raiz, 'types/api')

async function arquivosTsx(diretorio: string): Promise<string[]> {
  const entradas = await fs.readdir(diretorio, { withFileTypes: true })
  const encontrados = await Promise.all(entradas.map(async (entrada) => {
    const destino = path.join(diretorio, entrada.name)
    if (entrada.isDirectory()) return arquivosTsx(destino)
    return entrada.isFile() && entrada.name.endsWith('.tsx') ? [destino] : []
  }))
  return encontrados.flat()
}

function importacaoPara(arquivo: string): string {
  let relativo = path.relative(path.dirname(arquivo), contrato).replaceAll('\\', '/')
  if (!relativo.startsWith('.')) relativo = `./${relativo}`
  return `import type { ApiPayload } from '${relativo}'`
}

async function main() {
  let alterados = 0
  for (const arquivo of await arquivosTsx(raiz)) {
    let conteudo = await fs.readFile(arquivo, 'utf8')
    const anterior = conteudo

  conteudo = conteudo
      .replace(/useState\(\[\]\)/g, 'useState<ApiPayload[]>([])')
      .replace(/useState\(null\)/g, 'useState<ApiPayload | null>(null)')
      .replace(/useState\(\{/g, 'useState<ApiPayload>({')

    if (conteudo === anterior) continue

    if (!conteudo.includes("from '../types/api'") && !conteudo.includes("from '../../types/api'") && !conteudo.includes("from './types/api'")) {
      conteudo = `${importacaoPara(arquivo)}\n${conteudo}`
    } else if (!/import type \{[^}]*\bApiPayload\b[^}]*\} from ['"][^'"]*types\/api['"]/.test(conteudo)) {
      const importacaoExistente = /import type \{([^}]*)\} from (['"][^'"]*types\/api['"])/
      if (importacaoExistente.test(conteudo)) {
        conteudo = conteudo.replace(importacaoExistente, (_linha, nomes: string, origem: string) =>
          `import type { ${nomes.trim()}, ApiPayload } from ${origem}`)
      } else {
        conteudo = `${importacaoPara(arquivo)}\n${conteudo}`
      }
    }

    await fs.writeFile(arquivo, conteudo)
    alterados += 1
  }

  console.log(`${alterados} arquivos receberam tipos explícitos para estados de API legada.`)
}

void main()
