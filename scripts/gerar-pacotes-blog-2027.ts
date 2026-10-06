import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Publicacao = { id: string; data: string; horario: string; formato: string; titulo: string; estado: string; sazonal: boolean; janela_sazonal: string | null };
type Arte = { id: string; caminho: string; texto_alternativo: string };
type Pacote = Publicacao & { slug: string; texto: string | null; resumo: string | null; imagem_principal: string | null; alt_text: string | null; categoria: string; tags: string[]; autor: string; seo_title: string; meta_description: string; imagem_social: string | null; status_editorial: string; revisao_veterinaria: string; llm: { incluir: boolean; resumo: string | null; perguntas: string[] } };

const raiz = process.cwd();
const calendario = JSON.parse(readFileSync(resolve(raiz, 'docs/blog-agenda/calendario-2027.json'), 'utf8')) as { publicacoes: Publicacao[] };
const stop = new Set(['como','que','para','por','uma','um','de','do','da','dos','das','e','o','a','os','as','em','no','na','nos','nas','se','é','ao','à','com','sem','seu','sua','são','mais','não','pode','pet']);
const semAcento = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const slugify = (valor: string) => semAcento(valor.toLowerCase()).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tagsDoTitulo = (titulo: string) => [...new Set(semAcento(titulo.toLowerCase()).split(/[^a-z0-9]+/).filter((p) => p.length > 3 && !stop.has(p)))].slice(0, 6);
const categoriaPorFormato: Record<string, string> = { 'Âncora': 'saude-e-prevencao', 'Pergunta do Google': 'perguntas-do-tutor', 'Glossário': 'glossário-veterinário', 'Aula da trilha': 'trilha-saude-pet', 'Mito ou verdade': 'mitos-e-verdades', 'Retrospectiva': 'saude-e-prevencao' };
const imagens = new Map<string, Arte>();
for (const pasta of readdirSync(resolve(raiz, 'docs/blog-artes'), { withFileTypes: true })) {
  if (!pasta.isDirectory()) continue;
  const arquivo = resolve(raiz, 'docs/blog-artes', pasta.name, 'entregas.json');
  if (!existsSync(arquivo)) continue;
  const manifesto = JSON.parse(readFileSync(arquivo, 'utf8')) as { imagens?: Arte[] };
  for (const arte of manifesto.imagens ?? []) if (!imagens.has(arte.id)) imagens.set(arte.id, arte);
}
const pacotes: Pacote[] = calendario.publicacoes.map((p) => {
  const arte = imagens.get(p.id);
  const seoTitle = `${p.titulo} | Saúde PET`.slice(0, 70);
  const meta = `${p.titulo}. Orientações práticas, sinais de atenção e quando procurar um médico-veterinário.`.slice(0, 170);
  return { ...p, slug: slugify(p.titulo), texto: null, resumo: null, imagem_principal: arte?.caminho ?? null, alt_text: arte?.texto_alternativo ?? null, categoria: categoriaPorFormato[p.formato] ?? 'saude-e-prevencao', tags: tagsDoTitulo(p.titulo), autor: 'Equipe Saúde PET', seo_title: seoTitle, meta_description: meta, imagem_social: null, status_editorial: arte ? 'imagem_pronta_texto_pendente' : 'pauta_sem_imagem', revisao_veterinaria: 'pendente', llm: { incluir: false, resumo: null, perguntas: [] } };
});
const dir = resolve(raiz, 'docs/blog-agenda');
writeFileSync(resolve(dir, 'pacotes-2027.json'), JSON.stringify({ ano: 2027, total: pacotes.length, campos_obrigatorios: ['titulo','slug','texto','resumo','imagem_principal','alt_text','categoria','tags','autor','data','seo_title','meta_description','imagem_social','status_editorial'], regra: 'Nenhum pacote vira pronto para publicação enquanto texto, revisão veterinária, SEO, preview e LLM não estiverem concluídos.', pacotes }, null, 2));
const prontosImagem = pacotes.filter((p) => p.imagem_principal).length;
writeFileSync(resolve(dir, 'PACOTES_BLOG_2027.md'), `# Pacotes editoriais do blog Saúde Pet — 2027\n\nRegistro estruturado das 365 publicações em [pacotes-2027.json](pacotes-2027.json). Cada linha já possui data, horário, formato, título, slug, categoria, tags, autor, SEO planejado e vínculo de imagem quando existe.\n\n- Pacotes totais: **${pacotes.length}**\n- Com imagem local vinculada: **${prontosImagem}**\n- Com texto final: **0**\n- Com revisão veterinária: **0**\n- Prontos para publicação: **0**\n\nO texto médico será produzido em lotes, com revisão veterinária antes da publicação. O manifesto não altera o CMS nem agenda posts em produção.\n`);
console.log(JSON.stringify({ total: pacotes.length, imagens_vinculadas: prontosImagem, textos_finais: 0, revisao_veterinaria: 0, prontos_publicacao: 0, json: 'docs/blog-agenda/pacotes-2027.json', markdown: 'docs/blog-agenda/PACOTES_BLOG_2027.md' }));
