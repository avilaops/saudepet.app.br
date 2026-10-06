/** Copia um PNG já gerado e revisado para a coleção e registra seus metadados reais. */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, resolve } from 'node:path';

type Proposta = { id: string; slug: string; tema: string; estilo: string; proporcao: string; alt_planejado: string };
type Arte = { id: string; caminho: string; sha256: string; [campo: string]: unknown };
type Manifesto = { imagens: Arte[]; [campo: string]: unknown };

function executar(): void {
  const args = process.argv.slice(2);
  function argumento(nome: string): string {
    const indice = args.indexOf(nome);
    if (indice < 0 || !args[indice + 1] || args[indice + 1].startsWith('--')) throw new Error(`Falta ${nome}.`);
    return args[indice + 1];
  }
  const colecao = argumento('--colecao');
  const id = argumento('--id').toUpperCase();
  const origem = resolve(argumento('--origem'));
  const alt = argumento('--alt');
  if (!/^[a-z0-9-]+$/.test(colecao)) throw new Error('Nome de coleção inválido.');
  if (alt.trim().length < 20) throw new Error('Descreva a cena realmente observada antes de registrar a arte.');
  const raiz = process.cwd();
  const pastaColecoes = resolve(raiz, 'docs/blog-artes');
  const pasta = resolve(pastaColecoes, colecao);
  const propostas: Proposta[] = JSON.parse(readFileSync(resolve(pasta, 'prompts.json'), 'utf8')).imagens;
  const proposta = propostas.find(item => item.id.toUpperCase() === id);
  if (!proposta || !/^[a-z0-9-]+$/.test(proposta.slug)) throw new Error('ID ou nome de arquivo não encontrado nas propostas.');
  for (const outra of readdirSync(pastaColecoes, { withFileTypes: true })) {
    if (!outra.isDirectory() || outra.name === colecao) continue;
    const caminho = resolve(pastaColecoes, outra.name, 'entregas.json');
    if (existsSync(caminho) && JSON.parse(readFileSync(caminho, 'utf8')).imagens.some((arte: Arte) =>
      arte.final !== false && ['gerada_localmente', 'final', 'aprovada'].includes(String(arte.status))
      && arte.id.toUpperCase() === id)) {
      throw new Error(`${id} já está registrado em ${outra.name}.`);
    }
  }
  const png = readFileSync(origem);
  if (png.length < 24 || png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('A origem deve ser um PNG válido.');
  const largura = png.readUInt32BE(16);
  const altura = png.readUInt32BE(20);
  if (!largura || !altura) throw new Error('Dimensões PNG inválidas.');
  const hash = (dados: Buffer): string => createHash('sha256').update(dados).digest('hex');
  const sha256 = hash(png);
  const caminho = `frontend/public/blog-media/editorial/${colecao}/${proposta.slug}.png`;
  const destino = resolve(raiz, caminho);
  const arquivoManifesto = resolve(pasta, 'entregas.json');
  const manifesto: Manifesto = existsSync(arquivoManifesto)
    ? JSON.parse(readFileSync(arquivoManifesto, 'utf8'))
    : { colecao: 'Saúde Pet, âncoras do calendário', data: '2026-09-12', metodo: 'image_gen integrado', status: 'Coleção em produção, apenas arquivos concluídos e revisados constam neste inventário.', animacoes_entregues: 0, imagens: [] };
  const existente = manifesto.imagens.find(arte => arte.id === id);
  if (existente && (existente.sha256 !== sha256 || existente.caminho !== caminho)) throw new Error(`${id} já possui outra arte final; preserve a versão anterior e revise o inventário explicitamente.`);
  if (existsSync(destino) && hash(readFileSync(destino)) !== sha256) throw new Error('O destino já contém outra imagem e não será sobrescrito.');
  mkdirSync(resolve(raiz, `frontend/public/blog-media/editorial/${colecao}`), { recursive: true });
  if (!existsSync(destino)) copyFileSync(origem, destino);
  if (existente) { console.log(JSON.stringify({ id, status: 'ja_registrada', caminho })); return; }
  manifesto.imagens.push({
    id, tema: proposta.tema, linguagem: proposta.estilo, proporcao_nominal: proposta.proporcao,
    arquivo: basename(destino), largura, altura, bytes: png.length, sha256, caminho,
    arquivo_origem: basename(origem), texto_alternativo: alt.trim(),
    identidade: 'Referência ao Saúde Pet conferida na paleta e/ou no nome integrado à composição.',
    status: 'gerada_localmente', publicada: false, associada_ao_post: false,
    revisao_visual: 'Inspeção visual realizada antes do registro: assunto, composição, anatomia aparente, texto e referência de marca.'
  });
  manifesto.imagens.sort((a, b) => a.id.localeCompare(b.id));
  manifesto.total_artes_finais = manifesto.imagens.length;
  manifesto.total_arquivos_png = readdirSync(resolve(raiz, `frontend/public/blog-media/editorial/${colecao}`)).filter(nome => nome.endsWith('.png')).length;
  manifesto.formatos_finais = 'PNG original preservado, dimensões nativas. Proporções nominais podem ser aproximadas.';
  const temporario = `${arquivoManifesto}.novo`;
  writeFileSync(temporario, `${JSON.stringify(manifesto, null, 2)}\n`, 'utf8');
  renameSync(temporario, arquivoManifesto);
  console.log(JSON.stringify({ id, status: 'registrada', largura, altura, caminho, total: manifesto.imagens.length }));
}
try { executar(); } catch (erro) { console.error(erro instanceof Error ? erro.message : erro); process.exitCode = 1; }
