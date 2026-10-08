#!/usr/bin/env node
/**
 * Reprova a entrega quando um link público do Saúde Pet leva a lugar nenhum.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Em 04/10/2026 a revisão dos links públicos achou três buracos que somavam
 * várias páginas fora do ar, e nenhum deles aparecia em teste:
 *
 *   1. Rotas que o React conhecia mas o nginx não. O `location /` final
 *      devolve 404 para o que não está listado, então /tag/:id, /f/:id,
 *      /cadastrar, /esqueci-senha, /redefinir-senha, /verificar-email e
 *      /onboarding/tutor só abriam pela navegação interna do app. Aberto por
 *      link, QR code ou e-mail: 404.
 *
 *   2. Links que apontavam para rotas que o React não tem. O catch-all do
 *      roteador manda tudo para /app, que manda para o login — então o link
 *      de redefinir senha do e-mail perdia o token, o QR code da carteira
 *      (/pet-tag/:id) abria a tela de login, e o app instalado entrava em
 *      laço entre /login e /comecar.
 *
 *   3. Botões de e-mail apontando para telas que nunca existiram
 *      (/app/vet/chamados, /app/vacinas, /admin/vets, /suporte...), que o
 *      nginx responde com 404.
 *
 * Nenhum quebra o compilador. O que pega é cruzar as três fontes de verdade
 * — `App.tsx`, `nginx.saudepet.conf` e os links escritos no código.
 *
 * ── O que é verificado ────────────────────────────────────────────────────
 *
 *   A. Toda rota do React tem um `location` no nginx que não seja o
 *      `location /` de 404.
 *   B. Todo link interno literal no frontend (`to=`, `href=`, `navigate()`)
 *      e toda URL do site montada no backend (`urlDoSite()`, `FRONTEND_URL`,
 *      `SITE_URL` ou o domínio escrito por extenso, como nos e-mails) cai
 *      numa rota do React.
 *
 * Trechos dinâmicos (`${pet.id}`) viram um segmento qualquer. Arquivos
 * estáticos e `/api` ficam de fora: quem cuida deles é o próprio nginx.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ler = (relativo) => fs.readFileSync(path.join(raiz, relativo), 'utf8')

// ── Rotas do React ──────────────────────────────────────────────────────────
const rotasReact = [...ler('frontend/src/App.tsx').matchAll(/<Route\s+path="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((rota) => rota !== '*')

const padraoDaRota = (rota) =>
  new RegExp('^' + rota.replace(/:[^/]+/g, '[^/]+') + '/?$')
const padroesReact = rotasReact.map(padraoDaRota)

// ── Locations do nginx ──────────────────────────────────────────────────────
const nginx = ler('frontend/nginx.saudepet.conf')
const exatos = new Set([...nginx.matchAll(/location\s+=\s+(\S+)\s*\{/g)].map((m) => m[1]))
const regexes = [...nginx.matchAll(/location\s+(~\*?)\s+("?)(.+?)\2\s*\{/g)].map(
  (m) => new RegExp(m[3], m[1] === '~*' ? 'i' : '')
)
const nginxAtende = (url) => exatos.has(url) || regexes.some((re) => re.test(url))

const falhas = []

for (const rota of rotasReact) {
  const exemplo = rota.replace(/:[^/]+/g, 'exemplo123')
  if (!nginxAtende(exemplo)) {
    falhas.push(`A. ${rota} existe no React mas o nginx responde 404 (cai no "location /")`)
  }
}

// ── Links escritos no código ────────────────────────────────────────────────
const varrer = (dir) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
        if (['node_modules', 'dist'].includes(e.name)) return []
        const completo = path.join(dir, e.name)
        return e.isDirectory() ? varrer(completo) : [completo]
      })
    : []

const arquivos = [...varrer(path.join(raiz, 'frontend/src')), ...varrer(path.join(raiz, 'backend/src'))]
  .filter((f) => /\.(tsx?|jsx?)$/.test(f) && !/\.(test|spec)\./.test(f))

const padroesDeLink = [
  /\b(?:to|href)=["'](\/[^"'#?]*)/g,
  /\b(?:to|href)=\{`(\/[^`#?]*)/g,
  /\bnavigate\(\s*[`'"](\/[^`'"#?]*)/g,
  /\b(?:FRONTEND_URL|SITE_URL)\}(\/[^`'"#?]*)/g,
  /\burlDoSite\(\s*[`'"](\/[^`'"#?]*)/g,
  /https:\/\/saudepet\.app\.br(\/[^`'"#?\s)<>]*)/g
]
const ignorado = /^\/(api|v1|socket\.io|assets|icons|images|img|fonts)(\/|$)|\.[a-z0-9]+$/i

for (const arquivo of arquivos) {
  const fonte = fs.readFileSync(arquivo, 'utf8')
  for (const padrao of padroesDeLink) {
    for (const m of fonte.matchAll(padrao)) {
      const url = m[1].replace(/\$\{[^}]+\}/g, 'x').replace(/\/$/, '') || '/'
      if (ignorado.test(url) || padroesReact.some((re) => re.test(url))) continue
      const linha = fonte.slice(0, m.index).split('\n').length
      falhas.push(`B. ${path.relative(raiz, arquivo)}:${linha} aponta para ${m[1]}, que o React não tem`)
    }
  }
}

if (falhas.length) {
  console.error(`verificar-rotas: ${falhas.length} link(s) quebrado(s)\n`)
  for (const falha of falhas) console.error('  ' + falha)
  console.error('\nCorrija o link, crie a rota no App.tsx ou a entrada no nginx.saudepet.conf.')
  process.exit(1)
}

console.log(`verificar-rotas: ${rotasReact.length} rotas do React servidas pelo nginx, links internos ok`)
