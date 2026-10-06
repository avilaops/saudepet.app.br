import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

type Pauta = { id: string; titulo: string; formato: string; fonte: string };
type Publicacao = Pauta & { ordem: number; data: string; horario: string; sazonal: boolean; janela_sazonal: string | null; estado: string };

const raiz = process.cwd();
const calendario = readFileSync(resolve(raiz, 'docs/BLOG_CALENDARIO_ANUAL.md'), 'utf8');
const direcao = readFileSync(resolve(raiz, 'docs/BLOG_DIRECAO_VISUAL.md'), 'utf8');

function anchors(): Pauta[] {
  const corpo = calendario.slice(calendario.indexOf('## Janeiro'), calendario.indexOf('## O que ainda falta'));
  return [...corpo.matchAll(/^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*(?:\*\*)?(?:Pilar|Satélite)/gm)]
    .map((m) => ({ id: `ANC-${m[1].padStart(3, '0')}`, titulo: m[2].trim(), formato: 'Âncora', fonte: 'BLOG_CALENDARIO_ANUAL.md' }));
}
function direcaoPautas(prefix: string, formato: string): Pauta[] {
  const idPattern = prefix === 'TRI-M' ? 'TRI-M[0-9]+' : `${prefix}-[A-Z0-9-]+`;
  const re = new RegExp(`^\\|\\s*(${idPattern})\\s*\\|\\s*([^|]+?)\\s*\\|`, 'gm');
  return [...direcao.matchAll(re)].map((m) => ({ id: m[1].trim(), titulo: m[2].trim(), formato, fonte: 'BLOG_DIRECAO_VISUAL.md' }));
}

const aulasNovas = [
  'Como escolher o pet que cabe na sua rotina', 'Orçamento inicial: o primeiro mês sem susto', 'Casa segura antes da chegada', 'Como apresentar o pet à família',
  'Primeira noite: sinais e acolhimento', 'A rotina dos primeiros sete dias', 'Como montar uma estação de alimentação', 'Água, comedouro e higiene diária',
  'Como ler uma lista de ingredientes', 'Petiscos e recompensas com critério', 'Planejamento de vacinas', 'Como guardar documentos do pet',
  'Identificação em casa e na rua', 'Como preparar uma consulta', 'O que observar no comportamento', 'Higiene sem transformar em luta',
  'Escovação e cuidado com a pelagem', 'Unhas e patas na rotina', 'Ambiente que ajuda o gato', 'Brincadeira segura para cada idade',
  'Enriquecimento para dias chuvosos', 'Como interpretar latidos e miados', 'Plano de transporte para urgências', 'Kit de informações do pet',
  'Quando ligar para o veterinário', 'Como descrever um sintoma', 'Respiração, circulação e observação', 'Pele, olhos e ouvidos: o básico',
  'Digestão e eliminação: o que registrar', 'Dor e mudança de rotina', 'Prevenção de parasitas', 'Como acompanhar um tratamento',
  'Doença crônica sem perder a vida cotidiana', 'Adaptações para o pet idoso', 'Peso, mobilidade e conforto', 'Saúde mental do tutor e do pet',
  'Decisões compartilhadas com a família', 'Como avaliar qualidade de vida', 'Luto e memória com acolhimento', 'Revisão anual e próximos passos'
];
const mitosNovos = [
  'Nariz molhado sempre significa saúde', 'Todo espirro é gripe', 'Gato que ronrona nunca sente dor', 'Cão abanando o rabo está sempre feliz',
  'Pet precisa cruzar antes de castrar', 'Ração colorida é mais nutritiva', 'Comida natural serve igual para todo pet', 'Pet só precisa de água quando pede',
  'Banho semanal serve para qualquer pelagem', 'Cortar bigodes melhora a higiene', 'Gato não precisa brincar dentro de casa', 'Cachorro pequeno não precisa passear',
  'Animal idoso não aprende rotina nova', 'Pulga só existe em casa suja', 'Carrapato cai sozinho depois de cheio', 'Remédio humano em dose pequena não faz mal',
  'Se comeu algo estranho, é só dar leite', 'Vômito isolado nunca merece atenção', 'Diarreia é sempre mudança de ração', 'Olho vermelho melhora com colírio caseiro',
  'Mancar é frescura de animal', 'Cão agressivo precisa de bronca', 'Gato fora da caixa está se vingando', 'Latido se resolve com grito',
  'Medo de fogos passa se ignorar', 'Pet entende calendário sozinho', 'Microchip substitui identificação na coleira', 'Vacina anual é igual para todos',
  'Todo gato de apartamento é sedentário', 'Castrar resolve qualquer problema de comportamento', 'Filhote pode sair sem proteção', 'Cão de raça não precisa de prevenção',
  'Só o macho marca território', 'Fêmea precisa ter uma cria', 'Pet saudável não precisa de check-up', 'Exame normal vale para o resto da vida',
  'Doença crônica impede toda diversão', 'Rampa deixa o pet preguiçoso', 'Eutanásia é desistir do animal', 'Falar sobre fim de vida atrai coisa ruim'
];

const anc = anchors();
// Outubro tem cinco âncoras na pauta e quatro segundas-feiras no mês; a campanha
// do Dia dos Animais precisa ocupar 04/10. O tema renal é permanente e pode seguir.
const diaAnimais = anc.findIndex((p) => p.id === 'ANC-043');
const renal = anc.findIndex((p) => p.id === 'ANC-040');
if (diaAnimais >= 0 && renal >= 0) [anc[diaAnimais], anc[renal]] = [anc[renal], anc[diaAnimais]];
const perguntas = direcaoPautas('PER', 'Pergunta do Google');
const glossario = direcaoPautas('GLO', 'Glossário');
const tri = direcaoPautas('TRI-M', 'Aula da trilha');
const mitos = direcaoPautas('MIT', 'Mito ou verdade');
if (anc.length !== 52 || perguntas.length < 104 || glossario.length < 104 || tri.length !== 12 || mitos.length !== 12) {
  throw new Error(`Listas incompatíveis: ANC=${anc.length}, PER=${perguntas.length}, GLO=${glossario.length}, TRI=${tri.length}, MIT=${mitos.length}`);
}
const aulas: Pauta[] = [...tri, ...aulasNovas.map((titulo, i) => ({ id: `TRI-A${String(i + 13).padStart(2, '0')}`, titulo, formato: 'Aula da trilha', fonte: 'Pauta complementar 2027' }))];
const mitosFechados: Pauta[] = [...mitos, ...mitosNovos.map((titulo, i) => ({ id: `MIT-${String(i + 13).padStart(3, '0')}`, titulo, formato: 'Mito ou verdade', fonte: 'Pauta complementar 2027' }))];

const horarios: Record<string, string> = { 'Âncora': '09:00', 'Pergunta do Google': '10:00', 'Glossário': '12:00', 'Aula da trilha': '09:00', 'Mito ou verdade': '11:00', 'Retrospectiva': '18:00' };
const dataIso = (d: Date) => d.toISOString().slice(0, 10);
const datas = Array.from({ length: 365 }, (_, i) => { const d = new Date(Date.UTC(2027, 0, 1)); d.setUTCDate(d.getUTCDate() + i); return d; });
const segundas = datas.filter(d => d.getUTCDay() === 1);
const porMes = new Map<number, Pauta[]>();
anc.forEach((p, i) => { const mes = Math.floor(i / 4); if (!porMes.has(mes)) porMes.set(mes, []); porMes.get(mes)!.push(p); });
const indice = { anc: 0, per: 0, glo: 0, tri: 0, mit: 0 };
const publicacoes: Publicacao[] = [];
function sazonalidade(titulo: string, data: Date): string | null {
  const t = titulo.toLowerCase();
  if (t.includes('carnaval')) return 'Carnaval 2027 (09/02), publicar com antecedência';
  if (t.includes('réveillon')) return 'Réveillon, dezembro';
  if (t.includes('festa junina')) return 'Festas juninas e fogos, janela de junho';
  if (t.includes('outubro rosa')) return 'Outubro Rosa, outubro';
  if (t.includes('novembro azul')) return 'Novembro Azul, novembro';
  if (t.includes('dia dos animais')) return 'Dia dos Animais (04/10)';
  if (t.includes('natal')) return 'Natal, dezembro';
  if (t.includes('calor') || t.includes('asfalto quente')) return 'Verão, janeiro e fevereiro';
  if (t.includes('frio') || t.includes('inverno')) return 'Inverno curitibano, junho e julho';
  if (data.getUTCMonth() === 11 && data.getUTCDate() === 31) return 'Réveillon, 31/12';
  return null;
}
function add(d: Date, pauta: Pauta, formato = pauta.formato, estado = 'planejado'): void {
  const saz = sazonalidade(pauta.titulo, d);
  publicacoes.push({ ...pauta, formato, ordem: publicacoes.length + 1, data: dataIso(d), horario: horarios[formato] ?? '10:00', sazonal: Boolean(saz), janela_sazonal: saz, estado });
}
for (const d of datas) {
  const dow = d.getUTCDay();
  if (d.getUTCMonth() === 11 && d.getUTCDate() === 31) { add(d, { id: 'RET-2027', titulo: 'Retrospectiva anual: o que mudou na saúde do seu pet', formato: 'Retrospectiva', fonte: 'Calendário anual' }, 'Retrospectiva'); continue; }
  if (dow === 1) add(d, anc[indice.anc++]);
  else if (dow === 2 || dow === 5) add(d, perguntas[indice.per++]);
  else if (dow === 3 || dow === 6) add(d, glossario[indice.glo++]);
  else if (dow === 4) add(d, aulas[indice.tri++]);
  else if (dow === 5) add(d, perguntas[indice.perSex++]);
  else if (dow === 6) add(d, glossario[indice.gloSab++]);
  else add(d, mitosFechados[indice.mit++]);
}
if (publicacoes.length !== 365 || indice.anc !== 52 || indice.per !== 104 || indice.glo !== 104 || indice.tri !== 52 || indice.mit !== 52) throw new Error(`Distribuição inválida: ${JSON.stringify(indice)} / ${publicacoes.length}`);
const dir = resolve(raiz, 'docs/blog-agenda'); mkdirSync(dir, { recursive: true });
writeFileSync(resolve(dir, 'calendario-2027.json'), JSON.stringify({ ano: 2027, fuso: 'America/Sao_Paulo', total: 365, gerado_em: new Date().toISOString(), regra: 'Uma publicação por dia; segunda âncora, terça e sexta pergunta, quarta e sábado glossário, quinta trilha, domingo mito; 31/12 retrospectiva.', publicacoes, reservas: { glossario: glossario.slice(104), observacao: 'Dez verbetes excedentes permanecem como reserva editorial.' } }, null, 2));
const linhas = ['# Calendário real de publicação — Saúde Pet 2027', '', 'Calendário fechado para 365 publicações, em `America/Sao_Paulo`. O arquivo JSON é a fonte estruturada para CMS, SEO, previews e LLM. As datas abaixo são planejamento editorial local; não alteram a produção.', '', '| Ordem | Data | Hora | Formato | ID | Título | Sazonal | Estado |', '|---:|---|---:|---|---|---|---|---|'];
for (const p of publicacoes) linhas.push(`| ${p.ordem} | ${p.data.split('-').reverse().join('/')} | ${p.horario} | ${p.formato} | ${p.id} | ${p.titulo} | ${p.sazonal ? p.janela_sazonal : '—'} | ${p.estado} |`);
linhas.push('', '## Regras sazonais aplicadas', '', '- Carnaval 2027: 09/02; pautas de barulho, viagem e rotina entram antes da semana da festa.', '- Inverno e frio de Curitiba: junho e julho.', '- Dia dos Animais: 04/10.', '- Outubro Rosa e Novembro Azul: campanhas posicionadas dentro dos respectivos meses.', '- Natal e Réveillon: conteúdos de segurança publicados em dezembro, com retrospectiva em 31/12.', '', 'A associação aos posts existentes, a revisão veterinária, o preenchimento de SEO e a publicação continuam sendo etapas do fluxo editorial.');
writeFileSync(resolve(dir, 'CALENDARIO_REAL_2027.md'), `${linhas.join('\n')}\n`);
console.log(JSON.stringify({ total: publicacoes.length, anchors: indice.anc, perguntas: indice.per, glossario: indice.glo, aulas: indice.tri, mitos: indice.mit, sazonal: publicacoes.filter(p => p.sazonal).length, json: 'docs/blog-agenda/calendario-2027.json', markdown: 'docs/blog-agenda/CALENDARIO_REAL_2027.md' }));
