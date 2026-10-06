/**
 * Explicita os parâmetros que o JavaScript deixava implícitos.
 *
 * O compilador fornece a posição exata de TS7006/TS7031. Nomes claramente
 * numéricos e textuais recebem tipos primitivos; eventos DOM ficam como `any`
 * até o componente declarar o elemento concreto; objetos vindos das respostas
 * legadas usam o escape hatch documentado `ApiPayload`.
 */
import { promises as fs } from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const raizProjeto = path.resolve('frontend')
const raizSrc = path.join(raizProjeto, 'src')
const contrato = path.join(raizSrc, 'types/api')

const nomesNumericos = new Set([
  'i', 'idx', 'index', 'indice', 'posicao', 'pagina', 'grau', 'latitude',
  'longitude', 'bytes', 'loaded', 'highest', 'tentativa', 'direcao'
])
const nomesEvento = new Set(['e', 'event', 'evento'])
const nomesErro = new Set(['error', 'erro', 'err', 'requestError'])

function noMaisInterno(arquivo: ts.SourceFile, inicio: number): ts.Node {
  let atual: ts.Node = arquivo
  const visitar = (no: ts.Node) => {
    if (inicio >= no.getStart(arquivo) && inicio < no.getEnd()) {
      atual = no
      ts.forEachChild(no, visitar)
    }
  }
  visitar(arquivo)
  return atual
}

function parametroDe(no: ts.Node): ts.ParameterDeclaration | undefined {
  let atual: ts.Node | undefined = no
  while (atual && !ts.isParameter(atual)) atual = atual.parent
  return atual as ts.ParameterDeclaration | undefined
}

function tipoDoParametro(parametro: ts.ParameterDeclaration): { texto: string; api: boolean } {
  if (ts.isObjectBindingPattern(parametro.name) || ts.isArrayBindingPattern(parametro.name)) {
    return { texto: 'ApiPayload', api: true }
  }
  const nome = parametro.name.getText()
  if (nomesNumericos.has(nome)) return { texto: 'number', api: false }
  if (nomesEvento.has(nome) || nomesErro.has(nome)) return { texto: 'any', api: false }
  return { texto: 'ApiPayload', api: true }
}

function importacaoPara(arquivo: string): string {
  let relativo = path.relative(path.dirname(arquivo), contrato).replaceAll('\\', '/')
  if (!relativo.startsWith('.')) relativo = `./${relativo}`
  return `import type { ApiPayload } from '${relativo}'`
}

async function main() {
  const arquivoConfig = path.join(raizProjeto, 'tsconfig.json')
  const configLida = ts.readConfigFile(arquivoConfig, ts.sys.readFile)
  const config = ts.parseJsonConfigFileContent(configLida.config, ts.sys, raizProjeto)
  const programa = ts.createProgram(config.fileNames, config.options)
  const diagnosticos = ts.getPreEmitDiagnostics(programa).filter((d) => d.code === 7006 || d.code === 7031)
  const edicoes = new Map<string, Map<number, { texto: string; api: boolean }>>()

  for (const diagnostico of diagnosticos) {
    if (!diagnostico.file || diagnostico.start === undefined || !diagnostico.file.fileName.endsWith('.tsx')) continue
    const parametro = parametroDe(noMaisInterno(diagnostico.file, diagnostico.start))
    if (!parametro || parametro.type) continue
    const porPosicao = edicoes.get(diagnostico.file.fileName) || new Map()
    porPosicao.set(parametro.name.end, tipoDoParametro(parametro))
    edicoes.set(diagnostico.file.fileName, porPosicao)
  }

  let parametros = 0
  for (const [arquivo, porPosicao] of edicoes) {
    let conteudo = await fs.readFile(arquivo, 'utf8')
    let precisaApi = false
    for (const [posicao, tipo] of [...porPosicao].sort((a, b) => b[0] - a[0])) {
      conteudo = `${conteudo.slice(0, posicao)}: ${tipo.texto}${conteudo.slice(posicao)}`
      precisaApi ||= tipo.api
      parametros += 1
    }

    if (precisaApi && !/import type \{[^}]*\bApiPayload\b[^}]*\} from ['"][^'"]*types\/api['"]/.test(conteudo)) {
      conteudo = `${importacaoPara(arquivo)}\n${conteudo}`
    }
    await fs.writeFile(arquivo, conteudo)
  }

  let catches = 0
  const arquivosTsx = config.fileNames.filter((arquivo) => arquivo.endsWith('.tsx'))
  for (const arquivo of arquivosTsx) {
    const anterior = await fs.readFile(arquivo, 'utf8')
    const conteudo = anterior.replace(/catch \(([A-Za-z_$][\w$]*)\)(?!\s*=>)/g, (_trecho, nome: string) => {
      catches += 1
      return `catch (${nome}: any)`
    })
    if (conteudo !== anterior) await fs.writeFile(arquivo, conteudo)
  }

  console.log(`${parametros} parâmetros explícitos em ${edicoes.size} arquivos; ${catches} erros capturados foram marcados na fronteira dinâmica.`)
}

void main()
