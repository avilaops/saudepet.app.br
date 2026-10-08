#!/usr/bin/env node
/**
 * Quantos endereços do sitemap o Google realmente indexou.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * O painel do Search Console mostra o total, mas não diz QUAIS páginas estão
 * de fora, e é a lista que importa. Em 01/09/2026 o site tinha 26 dos 30
 * endereços em "descoberto, no momento não indexado", e a causa era que a
 * listagem do blog não trazia link nenhum: todo artigo era página órfã.
 * Sem rodar endereço por endereço, isso não aparece.
 *
 * ── Como usar ─────────────────────────────────────────────────────────────
 *
 *   gcloud config set account claude@contatos-424700.iam.gserviceaccount.com
 *   npx tsx scripts/verificar-indexacao.mts saudepet.app.br
 *
 * Serve para qualquer domínio da casa que esteja no Search Console como
 * propriedade de domínio (`sc-domain:`).
 *
 * A cota da API de inspeção é de 2000 endereços por dia e 600 por minuto, o
 * que sobra para qualquer site nosso.
 */
import { execFileSync } from 'node:child_process'

const dominio = process.argv[2]
if (!dominio) {
  console.error('uso: npx tsx scripts/verificar-indexacao.mts <dominio>')
  process.exit(1)
}

const ESCOPO = 'https://www.googleapis.com/auth/webmasters.readonly'

function tokenDoGcloud() {
  try {
    return execFileSync('gcloud', ['auth', 'print-access-token', `--scopes=${ESCOPO}`], {
      encoding: 'utf8',
      shell: process.platform === 'win32'
    }).trim()
  } catch {
    console.error('não consegui um token: confira `gcloud auth list` e a conta ativa.')
    process.exit(1)
  }
}

const token = tokenDoGcloud()

const resposta = await fetch(`https://${dominio}/sitemap.xml`)
if (!resposta.ok) {
  console.error(`sitemap de ${dominio} respondeu ${resposta.status}`)
  process.exit(1)
}
const enderecos = [...(await resposta.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())

if (enderecos.length === 0) {
  console.error('o sitemap não tem nenhum <loc>')
  process.exit(1)
}

console.log(`${enderecos.length} endereços no sitemap de ${dominio}\n`)

const contagem = new Map()
const foraDoIndice = []

for (const endereco of enderecos) {
  const r = await fetch('https://searchconsole.googleapis.com/v1/urlInspection/index:inspect', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl: endereco, siteUrl: `sc-domain:${dominio}` })
  })

  if (!r.ok) {
    console.log(`  ?  ${endereco}  (a API respondeu ${r.status})`)
    continue
  }

  const dados = await r.json()
  const estado = dados?.inspectionResult?.indexStatusResult?.coverageState || 'sem resposta'
  contagem.set(estado, (contagem.get(estado) || 0) + 1)
  if (!estado.startsWith('Submitted and indexed')) {
    foraDoIndice.push([estado, endereco.replace(`https://${dominio}`, '')])
  }
}

console.log('RESUMO')
for (const [estado, quantos] of [...contagem].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(quantos).padStart(3)}  ${estado}`)
}

if (foraDoIndice.length) {
  console.log('\nFORA DO ÍNDICE')
  for (const [estado, caminho] of foraDoIndice) {
    console.log(`  ${estado.padEnd(38)} ${caminho || '/'}`)
  }
  console.log(
    '\n"Discovered - currently not indexed" quase nunca é problema técnico da\n'
    + 'página: é o Google achando que não vale a pena rastrear. As causas usuais\n'
    + 'são página órfã (nenhuma página indexada aponta para ela) e domínio sem\n'
    + 'autoridade. Conferir primeiro se a listagem realmente traz os links:\n'
    + `  curl -s https://${dominio}/blog | grep -c 'href="/blog/'`
  )
}

const indexados = contagem.get('Submitted and indexed') || 0
console.log(`\n${indexados} de ${enderecos.length} indexados.`)
