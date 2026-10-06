#!/usr/bin/env node
/**
 * Reprova a entrega quando uma tela desenha conteúdo inventado.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Em 31/08/2026 a "central de notificações" foi encontrada mostrando quatro
 * avisos escritos à mão dentro do próprio `.tsx`, iguais para todo mundo, com
 * "Há 15 minutos" congelado no código desde que o arquivo nasceu. Não havia
 * tabela, endpoint nem nada atrás dela. A tela passou por revisão, por build e
 * por deploy sem ninguém notar, e só apareceu quando o dono do produto abriu o
 * aplicativo e estranhou.
 *
 * Compilador não pega isso: o array é válido. Teste não pega: ninguém escreve
 * teste para uma tela que "já funciona". O que pega é uma regra explícita, e é
 * ela que está aqui.
 *
 * ── O que conta como dado falso ───────────────────────────────────────────
 *
 * Um array de objetos escritos à mão, com valores todos literais, cujos campos
 * formam a assinatura de um REGISTRO de usuário e não de uma constante de
 * domínio. A distinção importa: `['001', 'Banco do Brasil']` é a lista de
 * bancos e deve continuar no código; `{ id: 'n-1', titulo: ..., mensagem: ...,
 * data: 'Há 15 minutos', lida: false }` é uma notificação fingindo ser real.
 *
 * Três sinais, e é preciso ter os três:
 *
 *   1. IDENTIDADE  — um campo de id com valor literal.
 *   2. CONTEÚDO    — titulo, nome, mensagem, descricao, texto, email...
 *   3. REGISTRO    — ou uma data escrita à mão, ou um campo de estado que só
 *                    existe em linha de banco (lida, status, preco, nota...).
 *
 * Copy de interface (os passos do acompanhamento, as telas do onboarding) tem
 * conteúdo mas não tem id nem estado, então passa. Menu de navegação tem id e
 * rótulo, mas não tem conteúdo nem estado, então passa.
 *
 * ── Escapatória ───────────────────────────────────────────────────────────
 *
 * Havendo um caso legítimo, a linha acima da constante recebe:
 *
 *   // dados-de-exemplo-proposital: <por que este caso é honesto>
 *
 * A justificativa é obrigatória. Escapatória sem motivo escrito não vale, para
 * que silenciar a regra custe pelo menos uma frase de quem silenciou.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const RAIZ = join(fileURLToPath(new URL('.', import.meta.url)), '..')

/** Onde uma tela ou uma resposta de API é montada. */
const PASTAS = [
  'frontend/src/pages',
  'frontend/src/components',
  'backend/src/controllers',
  'backend/src/services'
]

/**
 * Semente de banco e teste são dados de exemplo por definição.
 *
 * Comparação por SEGMENTO de caminho, nunca por substring: com `includes` no
 * caminho inteiro, um arquivo chamado `__prova-build.tsx` era pulado porque o
 * nome contém "build" — e pulado em silêncio, que é o pior comportamento
 * possível para uma verificação. `contestacao/` cairia na mesma armadilha por
 * conter "tests".
 */
const PASTAS_IGNORADAS = new Set(['node_modules', 'dist', 'build', '__tests__', 'tests', 'prisma', 'coverage'])

/** Arquivo de teste: sufixo no NOME, não pedaço solto do caminho. */
const ehArquivoDeTeste = (nome) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(nome)

const EXTENSOES = ['.ts', '.tsx', '.js', '.jsx']

const CAMPOS_DE_IDENTIDADE = new Set(['id', 'uuid', 'codigo', 'code', 'key', '_id'])

const CAMPOS_DE_CONTEUDO = new Set([
  'titulo', 'title', 'nome', 'name', 'mensagem', 'message', 'descricao', 'description',
  'texto', 'text', 'corpo', 'body', 'email', 'telefone', 'phone', 'comentario', 'comment',
  'observacao', 'resumo', 'endereco'
])

const CAMPOS_DE_DATA = new Set([
  'data', 'date', 'criado_em', 'criadoEm', 'atualizado_em', 'quando', 'horario', 'hora', 'timestamp'
])

const CAMPOS_DE_REGISTRO = new Set([
  'lida', 'lido', 'read', 'status', 'situacao', 'preco', 'price', 'valor', 'total',
  'nota', 'avaliacao', 'rating', 'quantidade', 'estoque', 'saldo', 'ativo', 'urgente'
])

// A justificativa tem que estar na MESMA linha do marcador e ter alguma
// substância. Com `\s*` no lugar de `[ \t]*` o casamento atravessava a quebra
// de linha e engolia o `const` seguinte como se fosse o motivo: escapatória
// vazia passava batido, que é o oposto do ponto.
const ESCAPATORIA = /dados-de-exemplo-proposital:[ \t]*\S[^\n]{9,}/

function listarArquivos(diretorio) {
  const achados = []
  let entradas
  try {
    entradas = readdirSync(diretorio)
  } catch {
    return achados
  }

  for (const entrada of entradas) {
    const caminho = join(diretorio, entrada)

    if (statSync(caminho).isDirectory()) {
      if (PASTAS_IGNORADAS.has(entrada)) continue
      achados.push(...listarArquivos(caminho))
    } else if (EXTENSOES.some((ext) => entrada.endsWith(ext)) && !ehArquivoDeTeste(entrada)) {
      achados.push(caminho)
    }
  }
  return achados
}

/** Literal puro: texto, número, booleano ou `null`. Nada calculado. */
function ehLiteral(no) {
  return ts.isStringLiteralLike(no)
    || ts.isNumericLiteral(no)
    || no.kind === ts.SyntaxKind.TrueKeyword
    || no.kind === ts.SyntaxKind.FalseKeyword
    || no.kind === ts.SyntaxKind.NullKeyword
    || (ts.isPrefixUnaryExpression(no) && ts.isNumericLiteral(no.operand))
}

function nomeDaPropriedade(propriedade) {
  const nome = propriedade.name
  if (!nome) return null
  if (ts.isIdentifier(nome) || ts.isStringLiteralLike(nome)) return nome.text
  return null
}

/**
 * Os sinais de um objeto. Só contam propriedades de valor literal: um campo
 * montado a partir de variável ou chamada não é dado escrito à mão.
 */
function sinaisDoObjeto(objeto) {
  const sinais = { identidade: false, conteudo: false, registro: false }

  for (const propriedade of objeto.properties) {
    if (!ts.isPropertyAssignment(propriedade)) continue

    const nome = nomeDaPropriedade(propriedade)
    if (!nome || !ehLiteral(propriedade.initializer)) continue

    const chave = nome.toLowerCase()
    if (CAMPOS_DE_IDENTIDADE.has(chave)) sinais.identidade = true
    else if (CAMPOS_DE_CONTEUDO.has(chave)) sinais.conteudo = true
    else if (CAMPOS_DE_DATA.has(chave) && ts.isStringLiteralLike(propriedade.initializer)) sinais.registro = true
    else if (CAMPOS_DE_REGISTRO.has(chave)) sinais.registro = true
  }

  return sinais
}

function analisar(caminho) {
  const codigo = readFileSync(caminho, 'utf8')
  const fonte = ts.createSourceFile(caminho, codigo, ts.ScriptTarget.Latest, true)
  const linhas = codigo.split('\n')
  const achados = []

  const visitar = (no) => {
    if (ts.isArrayLiteralExpression(no) && no.elements.length >= 2) {
      const objetos = no.elements.filter(ts.isObjectLiteralExpression)

      // Só interessa a lista feita INTEIRA de objetos escritos à mão.
      if (objetos.length === no.elements.length) {
        const suspeitos = objetos.filter((objeto) => {
          const s = sinaisDoObjeto(objeto)
          return s.identidade && s.conteudo && s.registro
        })

        if (suspeitos.length > 0) {
          const linha = fonte.getLineAndCharacterOfPosition(no.getStart(fonte)).line
          const anteriores = linhas.slice(Math.max(linha - 3, 0), linha + 1).join('\n')

          if (!ESCAPATORIA.test(anteriores)) {
            achados.push({ linha: linha + 1, quantidade: objetos.length })
          }
        }
      }
    }
    ts.forEachChild(no, visitar)
  }

  visitar(fonte)
  return achados
}

const arquivos = PASTAS.flatMap((pasta) => listarArquivos(join(RAIZ, pasta)))
const problemas = []

for (const arquivo of arquivos) {
  for (const achado of analisar(arquivo)) {
    problemas.push({ arquivo: relative(RAIZ, arquivo).split(sep).join('/'), ...achado })
  }
}

if (problemas.length === 0) {
  console.log(`✓ nenhum dado de exemplo desenhado como se fosse real (${arquivos.length} arquivos conferidos)`)
  process.exit(0)
}

console.error('\n❌ Dado de exemplo desenhado como se fosse real:\n')
for (const problema of problemas) {
  console.error(`  ${problema.arquivo}:${problema.linha}`)
  console.error(`      lista de ${problema.quantidade} registros escritos à mão, com id, conteúdo e estado.`)
  console.error('      Uma tela não pode mostrar isso como se viesse do banco.\n')
}
console.error('Como resolver, em ordem de preferência:')
console.error('  1. Ligar a tela ao dado real (endpoint + estado vazio honesto).')
console.error('  2. Remover a tela enquanto o dado real não existir.')
console.error('  3. Sendo legítimo, escrever na linha acima da constante:')
console.error('     // dados-de-exemplo-proposital: <por que este caso é honesto>\n')
process.exit(1)
