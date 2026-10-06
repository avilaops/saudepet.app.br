/** Concilia uma leitura da produção com as pautas e artes locais; não agenda publicações. */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Post = { id: string; slug: string; title: string; status: string; published_at: string | null; scheduled_for: string | null };
type Snapshot = { captured_at: string; timezone: string; domain: string; tenant: string; posts: Post[] };
type Arte = { id: string; caminho: string; arquivo: string; status: string; final?: boolean };
type Pauta = { id: string; mes: number; mes_nome: string; titulo: string; arte: string; correspondencia: string | null; post_existente: Post | null; visivel_no_snapshot: boolean; data_planejada_anual: null };
const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argumento = process.argv.indexOf('--snapshot');
if (argumento < 0 || !process.argv[argumento + 1]) throw new Error('Informe --snapshot com a leitura de produção.');
const arquivo = resolve(raiz, process.argv[argumento + 1]);
const snapshot: Snapshot = JSON.parse(readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, ''));
if (snapshot.domain !== 'saudepet.app.br' || snapshot.tenant !== 'saudepet' || snapshot.timezone !== 'America/Sao_Paulo') throw new Error('Snapshot de outro contexto.');
const instante = Date.parse(snapshot.captured_at);
if (!Number.isFinite(instante) || new Set(snapshot.posts.map(p => p.id)).size !== snapshot.posts.length) throw new Error('Snapshot inválido.');
for (const post of snapshot.posts) for (const data of [post.published_at, post.scheduled_for]) {
  if (data !== null && !Number.isFinite(Date.parse(data))) throw new Error('Data inválida: ' + post.slug);
}
const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const dataBr = (s: string | null) => s ? new Intl.DateTimeFormat('pt-BR', { timeZone: snapshot.timezone, dateStyle: 'short', timeStyle: 'short' }).format(new Date(s)) : 'Sem data';
const visivel = (p: Post) => (p.status === 'publicado' && p.published_at !== null && Date.parse(p.published_at) <= instante)
  || (p.status === 'agendado' && p.scheduled_for !== null && Date.parse(p.scheduled_for) <= instante);
const futuras = snapshot.posts.filter(p => p.status === 'agendado' && p.scheduled_for !== null && Date.parse(p.scheduled_for) > instante)
  .sort((a,b) => Date.parse(a.scheduled_for!) - Date.parse(b.scheduled_for!));
const artes = new Map<string, Arte>();
const dirArtes = resolve(raiz, 'docs/blog-artes');
for (const pasta of readdirSync(dirArtes, { withFileTypes: true }).filter(p => p.isDirectory())) {
  const arquivos = readdirSync(resolve(dirArtes, pasta.name));
  if (!arquivos.includes('entregas.json')) continue;
  const manifesto = JSON.parse(readFileSync(resolve(dirArtes, pasta.name, 'entregas.json'), 'utf8'));
  for (const arte of manifesto.imagens as Arte[]) {
    if (arte.final === false || !['gerada_localmente','final','aprovada'].includes(arte.status)) continue;
    const id = arte.id.toUpperCase();
    if (artes.has(id)) throw new Error('Arte duplicada: ' + id);
    artes.set(id, arte);
  }
}
const pautas: Pauta[] = [];
let mes = -1;
for (const linha of readFileSync(resolve(raiz, 'docs/BLOG_CALENDARIO_ANUAL.md'), 'utf8').split(/\r?\n/)) {
  if (linha.startsWith('## Regras de escrita')) break;
  if (linha.startsWith('## ')) mes = meses.findIndex(nome => linha.startsWith('## ' + nome + ','));
  if (mes < 0) continue;
  const partes = linha.split('|').map(p => p.trim());
  if (!/^\d+$/.test(partes[1] || '')) continue;
  const id = 'ANC-' + partes[1].padStart(3, '0');
  const arte = artes.get(id);
  if (!arte) throw new Error('Arte ausente: ' + id);
  const porTitulo = snapshot.posts.filter(p => normalizar(p.title) === normalizar(partes[2]));
  const porSlug = snapshot.posts.filter(p => p.slug === arte.arquivo.replace(/\.png$/, ''));
  const candidatos = porTitulo.length ? porTitulo : porSlug;
  if (candidatos.length > 1) throw new Error('Correspondência ambígua: ' + id);
  const post = candidatos[0] || null;
  pautas.push({id, mes: mes + 1, mes_nome: meses[mes], titulo: partes[2], arte: arte.caminho,
    correspondencia: post ? (porTitulo.length ? 'titulo_normalizado_exato' : 'slug_exato') : null,
    post_existente: post, visivel_no_snapshot: post ? visivel(post) : false, data_planejada_anual: null});
}
if (pautas.length !== 52 || new Set(pautas.map(p => p.id)).size !== 52) throw new Error('Esperadas 52 âncoras.');
const resumo = { posts_no_banco: snapshot.posts.length, visiveis: snapshot.posts.filter(visivel).length,
  agendamentos_futuros: futuras.length, rascunhos_sem_data: snapshot.posts.filter(p => p.status === 'rascunho' && !p.published_at && !p.scheduled_for).length,
  ancoras_com_arte: pautas.length, ancoras_com_post_identificado: pautas.filter(p => p.post_existente).length,
  ancoras_ja_visiveis: pautas.filter(p => p.visivel_no_snapshot).length };
const mapa = { captured_at: snapshot.captured_at, timezone: snapshot.timezone,
  status: 'Conferência local. Início do ciclo anual ainda não definido; nenhuma publicação alterada.',
  inicio_ciclo_anual: null, resumo, agendamentos_futuros: futuras, pautas };
writeFileSync(resolve(raiz, 'docs/blog-agenda/mapa-pautas.json'), JSON.stringify(mapa,null,2)+'\n');
const esc = (s: string) => s.replace(/\|/g,'\\|').replace(/\r?\n/g,' ');
const linhas = pautas.map(p => {
  const post=p.post_existente;
  const estado = p.visivel_no_snapshot ? 'Já público; não duplicar' : post ? post.status : 'Conciliar por tema';
  const data = post ? dataBr(post.status === 'publicado' ? post.published_at : post.scheduled_for) : 'A definir';
  return `| ${p.id} | ${p.mes_nome} | ${esc(p.titulo)} | ${data} | ${estado} | [Arte](../${p.arte}) |`;
});
const md = `# Saúde Pet — datas de publicação e conferência das pautas\n\n`+
  `Leitura de produção de **${dataBr(snapshot.captured_at)}**, horário de Brasília.\n\n`+
  `O calendário editorial define mês, ordem e formato semanal, mas não atribui dia e ano a cada título. **O início do ciclo anual ainda precisa ser definido.** As datas abaixo são as encontradas no banco, e não datas inventadas para as novas artes.\n\n`+
  `## Próximas publicações já agendadas\n\n| Data e hora de Brasília | Postagem |\n|---|---|\n`+
  futuras.map(p => `| ${dataBr(p.scheduled_for)} | ${esc(p.title)} |`).join('\n')+'\n\n'+
  `## Situação conferida\n\n- ${resumo.posts_no_banco} posts no banco; ${resumo.visiveis} já visíveis na regra pública.\n- ${resumo.agendamentos_futuros} agendamentos futuros e ${resumo.rascunhos_sem_data} rascunhos sem data.\n- 52 âncoras com arte local; ${resumo.ancoras_com_post_identificado} correspondências por título ou slug e ${resumo.ancoras_ja_visiveis} já pública.\n- Posts com status agendado e data passada já aparecem no blog. O status isolado não comprova uma publicação futura.\n\n`+
  `## Conferência das 52 pautas principais\n\n`+
  `“Conciliar por tema” significa que não houve correspondência exata de título ou slug; não comprova ausência de artigo semelhante. Rascunhos relacionados devem ser revisados antes de criar outro post. As artes permanecem locais, sem alteração de capas no servidor.\n\n`+
  `| ID | Mês editorial | Pauta | Data existente | Situação | Imagem |\n|---|---|---|---|---|---|\n`+linhas.join('\n')+'\n\n'+
  `## Definição da agenda anual\n\n`+
  `Ao definir o começo do ciclo, distribuir as pautas entre datas reais, preservar os agendamentos existentes e priorizar sazonalidade. A quantidade de segundas-feiras muda por mês e por ano: o desenho mensal não pode ser convertido mecanicamente em datas. Natal, Carnaval e campanhas devem aparecer com antecedência apropriada.\n\n`+
  `Ainda é necessário escolher 104 dos 114 verbetes listados, detalhar as 52 aulas e completar os 40 mitos restantes. Esses espaços não equivalem a artigos já prontos.\n\n`+
  `[Snapshot de produção](blog-agenda/${arquivo.split(/[\\/]/).pop()}) · [Mapa das pautas](blog-agenda/mapa-pautas.json) · [Calendário editorial](BLOG_CALENDARIO_ANUAL.md) · [Galeria de artes](blog-artes/index.html)\n`;
writeFileSync(resolve(raiz, 'docs/BLOG_AGENDA_PUBLICACAO.md'),md);
console.log(JSON.stringify(resumo));
