/**
 * Gera um HTML por área, cada um apontando para o seu manifesto.
 *
 * ── Por que isto existe ───────────────────────────────────────────────────
 *
 * Tutor e veterinário são dois aplicativos para quem usa, e vão ser dois
 * aplicativos nas lojas. O que decide qual aplicativo o celular instala é o
 * `<link rel="manifest">` da página aberta na hora, e o `index.html` do Vite
 * é um só, apontando para um manifesto só.
 *
 * Em vez de um segundo pacote (dois bundles, dois service workers, o dobro de
 * build), cada HTML é uma CÓPIA do `index.html` com o manifesto trocado. O
 * JavaScript e o CSS são exatamente os mesmos arquivos, já com o mesmo hash:
 * o navegador reaproveita o que já baixou.
 *
 * O nginx serve `/veterinario/*` a partir do `index-vet.html` e `/tutor/*` a
 * partir do `index-tutor.html`. Para o React, nada muda: é a mesma aplicação.
 *
 * ── Por que não trocar o manifesto por JavaScript ─────────────────────────
 *
 * Porque o navegador lê o manifesto ao carregar a página, e trocar o atributo
 * depois é corrida: às vezes o critério de instalação já foi avaliado. Servir
 * o HTML certo desde o começo não tem esse risco.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const DIST = join(process.cwd(), 'dist')
const ORIGEM = join(DIST, 'index.html')

if (!existsSync(ORIGEM)) {
  console.error('gerar-html-por-area: dist/index.html não existe. Rode depois do build.')
  process.exit(1)
}

const AREAS = [
  { arquivo: 'index-tutor.html', manifesto: '/manifest-tutor.webmanifest', titulo: 'Saúde Pet' },
  { arquivo: 'index-vet.html', manifesto: '/manifest-vet.webmanifest', titulo: 'Saúde Pet Veterinário' }
]

const original = readFileSync(ORIGEM, 'utf8')

// O plugin de PWA injeta o link do manifesto; se ele mudar de formato, é aqui
// que quebra, e quebra alto em vez de gerar um HTML silenciosamente errado.
const PADRAO_MANIFESTO = /<link[^>]+rel=["']manifest["'][^>]*>/i
if (!PADRAO_MANIFESTO.test(original)) {
  console.error('gerar-html-por-area: não achei o <link rel="manifest"> no index.html gerado.')
  process.exit(1)
}

for (const area of AREAS) {
  let html = original.replace(
    PADRAO_MANIFESTO,
    `<link rel="manifest" href="${area.manifesto}" />`
  )
  html = html.replace(
    /<meta name="apple-mobile-web-app-title"[^>]*>/i,
    `<meta name="apple-mobile-web-app-title" content="${area.titulo}" />`
  )
  writeFileSync(join(DIST, area.arquivo), html)
  console.log(`  ${area.arquivo}  ->  ${area.manifesto}`)
}

console.log(`gerar-html-por-area: ${AREAS.length} arquivos gerados.`)
