/**
 * Visual QA do Saúde Pet: tira print de TODAS as telas do frontend, em 3
 * viewports e em vários estados (normal, carregando, vazio, erro), monta uma
 * folha de contato com filtros e — se houver baseline — o diff pixel a pixel.
 *
 * Uso (na raiz do repo, com frontend rodando em http://localhost:5173):
 *   node scripts/screenshots-telas.mjs                       # públicas + auth, estado normal
 *   node scripts/screenshots-telas.mjs --areas=tutor,admin   # áreas logadas (precisa das credenciais)
 *   node scripts/screenshots-telas.mjs --estados=normal,carregando,vazio,erro
 *   node scripts/screenshots-telas.mjs --viewports=mobile,desktop
 *   node scripts/screenshots-telas.mjs --baseline            # promove a captura atual a baseline
 *
 * Fluxo de regressão visual:
 *   1. node scripts/screenshots-telas.mjs --baseline        (antes da mudança)
 *   2. ...altera o código...
 *   3. node scripts/screenshots-telas.mjs                    (compara com o baseline, gera diff/)
 *
 * Variáveis de ambiente (para as áreas logadas):
 *   BASE_URL (padrão http://localhost:5173) · API_URL (padrão http://localhost:3000/api)
 *   TUTOR_EMAIL/TUTOR_SENHA · VET_EMAIL/VET_SENHA · ADMIN_EMAIL/ADMIN_SENHA · PARCEIRO_EMAIL/PARCEIRO_SENHA
 *   ID_ATENDIMENTO, ID_PET, ID_VET, ID_TUTOR, ID_PEDIDO, SLUG_LOJA, SLUG_POST
 *     — preenchem os parâmetros :id das rotas dinâmicas (se ausentes, a rota é pulada)
 *   DIFF_LIMIAR — fração de pixels diferentes a partir da qual conta como mudança (padrão 0.002)
 *
 * Primeira vez: npx playwright install chromium
 * Saída:
 *   output/screenshots/current/<area>/<viewport>/<rota>[.estado].png
 *   output/screenshots/baseline/...   (cópia promovida com --baseline)
 *   output/screenshots/diff/...       (só onde houve diferença)
 *   output/screenshots/index.html     (folha de contato com filtros)
 */
import { chromium } from 'playwright'
import { mkdir, writeFile, readFile, rm, cp, access } from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'

// O Playwright embute o pngjs; reaproveitamos em vez de adicionar dependência.
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle')

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173'
const API_URL = process.env.API_URL || 'http://localhost:3000/api'
const DIFF_LIMIAR = Number(process.env.DIFF_LIMIAR || 0.002)
const RAIZ = path.resolve('output/screenshots')
const DIR = { current: path.join(RAIZ, 'current'), baseline: path.join(RAIZ, 'baseline'), diff: path.join(RAIZ, 'diff') }

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablet: { width: 820, height: 1180 },
  desktop: { width: 1440, height: 900 },
}

/**
 * Estados são simulados interceptando a API — o mesmo HTML, quatro respostas:
 *  - normal:     passa direto
 *  - carregando: segura toda chamada da API (a tela fica no skeleton/spinner)
 *  - vazio:      responde 200 com lista vazia / objeto vazio
 *  - erro:       responde 500
 * `vazio` e `erro` só fazem sentido em telas que buscam dados; nas públicas
 * estáticas o print sai igual ao normal (e o diff vai mostrar isso).
 */
const ESTADOS = {
  normal: null,
  carregando: async (route) => { await new Promise(() => {}) /* nunca responde */ },
  vazio: (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  erro: (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"simulado"}' }),
}

const P = {
  atendimento: process.env.ID_ATENDIMENTO,
  pet: process.env.ID_PET,
  vet: process.env.ID_VET,
  tutor: process.env.ID_TUTOR,
  pedido: process.env.ID_PEDIDO,
  loja: process.env.SLUG_LOJA,
  post: process.env.SLUG_POST,
}

// Mapa de rotas, espelho de frontend/src/App.tsx. `undefined` em parâmetro = pular.
const AREAS = {
  public: {
    auth: null,
    rotas: [
      '/', '/faq', '/contato', '/blog', P.post && `/blog/${P.post}`, '/privacidade',
      '/mercado', P.loja && `/mercado/${P.loja}`,
      '/login', '/cadastrar', '/esqueci-senha', '/redefinir-senha', '/verificar-email', '/onboarding/tutor',
    ],
  },
  tutor: {
    auth: ['TUTOR_EMAIL', 'TUTOR_SENHA'],
    rotas: [
      '/tutor/home', '/tutor/pets', '/tutor/solicitar', P.atendimento && `/tutor/acompanhar/${P.atendimento}`,
      '/tutor/historico', P.atendimento && `/tutor/atendimento/${P.atendimento}/prontuario`,
      '/tutor/lembretes', '/tutor/agenda', '/tutor/marcar-consulta', P.atendimento && `/tutor/avaliar/${P.atendimento}`,
      '/tutor/privacidade', '/tutor/perfil', '/tutor/mensagens', '/tutor/notificacoes', '/tutor/dispositivos',
      P.vet && `/tutor/chat/${P.vet}`, '/tutor/parceiros', P.pet && `/tutor/pet/${P.pet}/carteira`, '/tutor/planos',
      '/tutor/mercado', '/tutor/mercado/carrinho', '/tutor/mercado/pedidos',
      P.pedido && `/tutor/mercado/pedidos/${P.pedido}`, P.pedido && `/tutor/mercado/pedidos/${P.pedido}/pagamento`,
      P.atendimento && `/tutor/pagamento/${P.atendimento}`,
    ],
  },
  veterinario: {
    auth: ['VET_EMAIL', 'VET_SENHA'],
    rotas: [
      '/veterinario/home', '/veterinario/onboarding', '/veterinario/plantao', '/veterinario/agendamentos',
      P.atendimento && `/veterinario/atendimento/${P.atendimento}`,
      P.atendimento && `/veterinario/atendimento/${P.atendimento}/prontuario`,
      P.atendimento && `/veterinario/atendimento/${P.atendimento}/historico-do-pet`,
      '/veterinario/estatisticas', '/veterinario/historico', '/veterinario/perfil', '/veterinario/mensagens',
      '/veterinario/notificacoes', '/veterinario/dispositivos', P.tutor && `/veterinario/chat/${P.tutor}`,
      '/veterinario/configuracoes', '/veterinario/documentacao', '/veterinario/repasses', '/veterinario/cobrancas',
      '/veterinario/conta-bancaria', '/veterinario/clube', '/veterinario/clientes', P.tutor && `/veterinario/clientes/${P.tutor}`,
      '/veterinario/crm/agenda', '/veterinario/crm/painel', '/veterinario/crm/retencao', '/veterinario/agenda',
    ],
  },
  admin: {
    auth: ['ADMIN_EMAIL', 'ADMIN_SENHA'],
    rotas: [
      '/admin/dashboard', '/admin/operacoes', '/admin/veterinarios', '/admin/usuarios', '/admin/atendimentos',
      '/admin/analytics', '/admin/leads', '/admin/blog', '/admin/blog/novo', '/admin/whatsapp', '/admin/parceiros',
      '/admin/financeiro', '/admin/pagamentos', '/admin/moderacao', '/admin/formularios', '/admin/planos',
      '/admin/repasses', '/admin/tenants', '/admin/sistema', '/admin/auditoria',
      P.atendimento && `/admin/atendimentos/${P.atendimento}/auditoria`,
      '/admin/cidades', '/admin/banners', '/admin/mercado', '/admin/notificacoes', '/admin/dispositivos',
    ],
  },
  parceiro: {
    auth: ['PARCEIRO_EMAIL', 'PARCEIRO_SENHA'],
    rotas: ['/parceiro/painel', '/parceiro/financeiro', '/parceiro/perfil'],
  },
  mercado: {
    auth: ['TUTOR_EMAIL', 'TUTOR_SENHA'],
    rotas: ['/mercado/loja', '/mercado/loja/painel', '/mercado/loja/catalogo', '/mercado/loja/feed'],
  },
}

// ---------- argumentos ----------
const arg = (nome, padrao) => (process.argv.find((a) => a.startsWith(`--${nome}=`)) || `--${nome}=${padrao}`).split('=')[1]
const flag = (nome) => process.argv.includes(`--${nome}`)
const areasPedidas = arg('areas', 'public').split(',')
const estadosPedidos = arg('estados', 'normal').split(',').filter((e) => e in ESTADOS)
const viewportsPedidos = arg('viewports', Object.keys(VIEWPORTS).join(',')).split(',').filter((v) => v in VIEWPORTS)
const promoverBaseline = flag('baseline')

// ---------- util ----------
const existe = (p) => access(p).then(() => true, () => false)
const nomeArquivo = (rota) => (rota === '/' ? 'home' : rota.replace(/^\//, '').replace(/[/:]/g, '_'))

async function login(emailVar, senhaVar) {
  const email = process.env[emailVar]
  const senha = process.env[senhaVar]
  if (!email || !senha) return null
  const r = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, senha }),
  })
  if (!r.ok) throw new Error(`login ${email} falhou: ${r.status}`)
  const d = await r.json()
  return { token: d.access_token, refresh: d.refresh_token, usuario: d.usuario }
}

/** Compara dois PNGs; grava um diff (vermelho onde mudou) e devolve a fração de pixels diferentes. */
async function comparar(arqBase, arqAtual, arqDiff) {
  const a = PNG.sync.read(await readFile(arqBase))
  const b = PNG.sync.read(await readFile(arqAtual))
  const w = Math.max(a.width, b.width)
  const h = Math.max(a.height, b.height)
  const out = new PNG({ width: w, height: h })
  let diferentes = 0
  const px = (img, x, y) => (x < img.width && y < img.height ? (y * img.width + x) * 4 : -1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ia = px(a, x, y), ib = px(b, x, y), io = (y * w + x) * 4
      const igual = ia >= 0 && ib >= 0 &&
        Math.abs(a.data[ia] - b.data[ib]) < 16 && Math.abs(a.data[ia + 1] - b.data[ib + 1]) < 16 && Math.abs(a.data[ia + 2] - b.data[ib + 2]) < 16
      if (igual) {
        // fundo: a imagem atual esmaecida, para o vermelho saltar
        const g = Math.round((b.data[ib] + b.data[ib + 1] + b.data[ib + 2]) / 3)
        out.data[io] = out.data[io + 1] = out.data[io + 2] = 200 + Math.round(g * 0.2)
      } else {
        diferentes++
        out.data[io] = 220; out.data[io + 1] = 40; out.data[io + 2] = 60
      }
      out.data[io + 3] = 255
    }
  }
  const fracao = diferentes / (w * h)
  if (fracao >= DIFF_LIMIAR) {
    await mkdir(path.dirname(arqDiff), { recursive: true })
    await writeFile(arqDiff, PNG.sync.write(out))
  }
  return { fracao, tamanhoMudou: a.width !== b.width || a.height !== b.height }
}

// ---------- captura ----------
async function main() {
  await rm(DIR.current, { recursive: true, force: true })
  await rm(DIR.diff, { recursive: true, force: true })
  await mkdir(DIR.current, { recursive: true })
  const temBaseline = await existe(DIR.baseline)

  const browser = await chromium.launch()
  const capturas = [] // { area, rota, estado, viewport, arquivo, status, diff?, fracao? }

  for (const area of areasPedidas) {
    const cfg = AREAS[area]
    if (!cfg) { console.warn(`área desconhecida: ${area}`); continue }
    const sessao = cfg.auth ? await login(...cfg.auth) : null
    if (cfg.auth && !sessao) { console.warn(`[${area}] sem credenciais (${cfg.auth.join('/')}), pulando`); continue }

    for (const vp of viewportsPedidos) {
      for (const estado of estadosPedidos) {
        const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: 1, locale: 'pt-BR', reducedMotion: 'reduce' })
        if (sessao) {
          await ctx.addInitScript((s) => {
            localStorage.setItem('token', s.token)
            if (s.refresh) localStorage.setItem('refresh_token', s.refresh)
            localStorage.setItem('user', JSON.stringify(s.usuario))
          }, sessao)
        }
        const interceptar = ESTADOS[estado]
        // `/auth/me` continua real em todos os estados: sem ele o PrivateRoute derruba a sessão.
        if (interceptar) await ctx.route(/\/api\/(?!.*auth\/me)/, interceptar)

        const page = await ctx.newPage()
        await mkdir(path.join(DIR.current, area, vp), { recursive: true })

        for (const rota of cfg.rotas.filter(Boolean)) {
          const sufixo = estado === 'normal' ? '' : `.${estado}`
          const rel = path.join(area, vp, `${nomeArquivo(rota)}${sufixo}.png`)
          const arquivo = path.join(DIR.current, rel)
          const item = { area, rota, estado, viewport: vp, arquivo: rel.replace(/\\/g, '/'), status: 'ok' }
          try {
            // No estado "carregando" o networkidle nunca chega: espera só o DOM e um instante.
            await page.goto(`${BASE_URL}${rota}`, { waitUntil: estado === 'carregando' ? 'domcontentloaded' : 'networkidle', timeout: 20000 })
            await page.waitForTimeout(estado === 'carregando' ? 800 : 400)
            await page.screenshot({ path: arquivo, fullPage: true })
            if (temBaseline && await existe(path.join(DIR.baseline, rel))) {
              const r = await comparar(path.join(DIR.baseline, rel), arquivo, path.join(DIR.diff, rel))
              item.fracao = r.fracao
              if (r.fracao >= DIFF_LIMIAR) { item.status = 'mudou'; item.diff = item.arquivo }
            } else if (temBaseline) {
              item.status = 'novo'
            }
            console.log(`${item.status === 'mudou' ? '△' : '✓'} ${area} ${vp} ${estado} ${rota}${item.fracao != null ? ` (${(item.fracao * 100).toFixed(2)}%)` : ''}`)
          } catch (e) {
            item.status = 'falhou'
            item.erro = e.message.split('\n')[0]
            console.warn(`✗ ${area} ${vp} ${estado} ${rota}: ${item.erro}`)
          }
          capturas.push(item)
        }
        await ctx.close()
      }
    }
  }
  await browser.close()

  if (promoverBaseline) {
    await rm(DIR.baseline, { recursive: true, force: true })
    await cp(DIR.current, DIR.baseline, { recursive: true })
    console.log('\nBaseline atualizado a partir desta captura.')
  }

  await escreverIndice(capturas, temBaseline)
  const resumo = capturas.reduce((m, c) => ((m[c.status] = (m[c.status] || 0) + 1), m), {})
  console.log(`\n${capturas.length} capturas · ${Object.entries(resumo).map(([k, v]) => `${k}: ${v}`).join(' · ')}`)
  console.log(`Folha de contato: ${path.join(RAIZ, 'index.html')}`)
}

// ---------- folha de contato ----------
async function escreverIndice(capturas, temBaseline) {
  // Agrupa por área+rota+estado; cada grupo é uma linha com os viewports lado a lado.
  const grupos = new Map()
  for (const c of capturas) {
    const k = `${c.area}|${c.rota}|${c.estado}`
    if (!grupos.has(k)) grupos.set(k, { area: c.area, rota: c.rota, estado: c.estado, itens: [] })
    grupos.get(k).itens.push(c)
  }
  const areas = [...new Set(capturas.map((c) => c.area))]
  const estados = [...new Set(capturas.map((c) => c.estado))]
  const viewports = [...new Set(capturas.map((c) => c.viewport))]
  const statusList = ['ok', 'mudou', 'novo', 'falhou']

  const chips = (nome, valores) => valores.map((v) => `<label><input type="checkbox" data-filtro="${nome}" value="${v}" checked> ${v}</label>`).join('')
  const linhas = [...grupos.values()].map((g) => {
    const status = g.itens.some((i) => i.status === 'mudou') ? 'mudou' : g.itens.some((i) => i.status === 'falhou') ? 'falhou' : g.itens.some((i) => i.status === 'novo') ? 'novo' : 'ok'
    const figs = g.itens.map((i) => {
      const cur = `current/${i.arquivo}`
      const corpo = i.status === 'falhou'
        ? `<div class="falha">${i.erro}</div>`
        : `<a href="${cur}" target="_blank"><img loading="lazy" src="${cur}" alt=""></a>` +
          (i.diff ? `<a class="diff" href="diff/${i.diff}" target="_blank"><img loading="lazy" src="diff/${i.diff}" alt=""></a>` : '')
      return `<figure data-viewport="${i.viewport}" data-status="${i.status}"><figcaption>${i.viewport} · <b class="s-${i.status}">${i.status}</b>${i.fracao != null ? ` · ${(i.fracao * 100).toFixed(2)}%` : ''}</figcaption>${corpo}</figure>`
    }).join('')
    return `<section data-area="${g.area}" data-estado="${g.estado}" data-status="${status}"><h2><span class="s-${status}">●</span> ${g.area} · <code>${g.rota}</code> <em>${g.estado}</em></h2><div class="row">${figs}</div></section>`
  }).join('')

  const html = `<!doctype html><meta charset="utf-8"><title>Visual QA — Saúde Pet</title>
<style>
body{font:14px system-ui;margin:0;background:#f4f6f6;color:#15343a}
header{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #d7e7e5;padding:12px 24px;display:flex;flex-wrap:wrap;gap:18px;align-items:center}
header h1{font-size:15px;margin:0 12px 0 0}header fieldset{border:0;padding:0;margin:0;display:flex;gap:8px;align-items:center}
header legend{font-size:10px;text-transform:uppercase;letter-spacing:.12em;color:#587076;float:left;margin-right:6px}
header label{font-size:12px;background:#eef3f3;border-radius:999px;padding:3px 9px;cursor:pointer}
main{padding:12px 24px}section{margin:28px 0}section[hidden]{display:none}
h2{font-size:14px;margin:0 0 8px}code{color:#127e82}em{font-style:normal;font-size:11px;color:#587076;background:#eef3f3;border-radius:6px;padding:1px 6px;margin-left:6px}
.row{display:flex;gap:16px;align-items:flex-start;overflow-x:auto}figure{margin:0;flex:none;background:#fff;border:1px solid #d7e7e5;border-radius:8px;padding:8px;display:flex;gap:8px}
figure[hidden]{display:none}figcaption{writing-mode:vertical-rl;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#587076}
img{display:block;height:auto;max-height:720px;object-fit:cover;object-position:top;border:1px solid #e5eeed}
figure[data-viewport=mobile] img{width:260px}figure[data-viewport=tablet] img{width:410px}figure[data-viewport=desktop] img{width:720px}
.diff img{outline:2px solid #dc2846}.falha{width:260px;padding:16px;font-size:12px;color:#9e2d2d;background:#fff0f0;border-radius:6px}
.s-ok{color:#15a05a}.s-mudou{color:#dc2846}.s-novo{color:#f58235}.s-falhou{color:#9e2d2d}
#contagem{font-size:12px;color:#587076;margin-left:auto}
</style>
<header><h1>Visual QA — Saúde Pet</h1>
<fieldset><legend>Área</legend>${chips('area', areas)}</fieldset>
<fieldset><legend>Estado</legend>${chips('estado', estados)}</fieldset>
<fieldset><legend>Viewport</legend>${chips('viewport', viewports)}</fieldset>
<fieldset><legend>Status</legend>${chips('status', statusList)}</fieldset>
<span id="contagem"></span></header>
<main><p style="font-size:12px;color:#587076">${new Date().toLocaleString('pt-BR')} · ${capturas.length} capturas${temBaseline ? ' · comparadas com baseline/' : ' · sem baseline (rode com --baseline para criar)'}</p>${linhas}</main>
<script>
const ativos=()=>{const m={};document.querySelectorAll('[data-filtro]').forEach(i=>{(m[i.dataset.filtro]??=new Set());if(i.checked)m[i.dataset.filtro].add(i.value)});return m}
function aplicar(){const f=ativos();let n=0;document.querySelectorAll('section').forEach(s=>{const ok=f.area.has(s.dataset.area)&&f.estado.has(s.dataset.estado)&&f.status.has(s.dataset.status);s.hidden=!ok;if(ok){n++;s.querySelectorAll('figure').forEach(g=>{g.hidden=!f.viewport.has(g.dataset.viewport)})}});document.getElementById('contagem').textContent=n+' rotas visíveis'}
document.querySelectorAll('[data-filtro]').forEach(i=>i.addEventListener('change',aplicar));aplicar()
</script>`
  await writeFile(path.join(RAIZ, 'index.html'), html)
}

main().catch((e) => { console.error(e); process.exit(1) })
