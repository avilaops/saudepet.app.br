import { existsSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Gera um acervo navegável a partir das entregas finais, sem alterar os PNGs. */
type Objeto = Record<string, unknown>;
type Colecao = { pasta: string; nome: string; data: string; galeria: string | null; manifesto: string };
type Arte = {
  id: string; tema: string; linguagem: string; proporcao: string; caminho: string;
  largura: number; altura: number; textoAlternativo: string; colecao: Colecao;
};

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const diretorio = resolve(raiz, 'docs/blog-artes');
const destino = resolve(diretorio, 'index.html');
const statusFinais = new Set(['gerada_localmente', 'final', 'aprovada']);

function objeto(valor: unknown, contexto: string): Objeto {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    throw new Error(`${contexto}: objeto esperado.`);
  }
  return valor as Objeto;
}

function texto(valor: unknown, contexto: string): string {
  if (typeof valor !== 'string' || !valor.trim()) throw new Error(`${contexto}: texto obrigatório.`);
  return valor.trim();
}

function inteiro(valor: unknown, contexto: string): number {
  if (typeof valor !== 'number' || !Number.isSafeInteger(valor) || valor <= 0) {
    throw new Error(`${contexto}: dimensão inteira positiva obrigatória.`);
  }
  return valor;
}

function escapar(valor: string | number): string {
  return String(valor).replace(/[&<>"']/g, caractere => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[caractere]!);
}

function urlLocal(arquivo: string): string {
  return relative(diretorio, arquivo).split(sep).map(encodeURIComponent).join('/');
}

function normalizar(valor: string): string {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
}

function lerPng(caminho: string, largura: number, altura: number): void {
  const dados = readFileSync(caminho);
  const assinatura = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (dados.length < 24 || !dados.subarray(0, 8).equals(assinatura) || dados.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`PNG inválido: ${relative(raiz, caminho)}.`);
  }
  const larguraReal = dados.readUInt32BE(16);
  const alturaReal = dados.readUInt32BE(20);
  if (larguraReal !== largura || alturaReal !== altura) {
    throw new Error(`Dimensões divergentes em ${relative(raiz, caminho)}: manifesto ${largura}×${altura}, PNG ${larguraReal}×${alturaReal}.`);
  }
}

function resolverImagem(valor: unknown, contexto: string, largura: number, altura: number): string {
  const caminhoRelativo = texto(valor, `${contexto}.caminho`);
  if (isAbsolute(caminhoRelativo) || /^[a-z][a-z\d+.-]*:/i.test(caminhoRelativo)) {
    throw new Error(`${contexto}.caminho deve ser relativo à raiz do repositório.`);
  }
  const caminho = resolve(raiz, caminhoRelativo.replace(/[\\/]/g, sep));
  const diferenca = relative(raiz, caminho);
  if (diferenca === '..' || diferenca.startsWith(`..${sep}`) || isAbsolute(diferenca)) {
    throw new Error(`${contexto}.caminho aponta para fora do repositório.`);
  }
  if (!existsSync(caminho)) throw new Error(`Imagem final ausente: ${caminhoRelativo}.`);
  const diferencaReal = relative(realpathSync(raiz), realpathSync(caminho));
  if (diferencaReal === '..' || diferencaReal.startsWith(`..${sep}`) || isAbsolute(diferencaReal)) {
    throw new Error(`${contexto}.caminho resolve para fora do repositório.`);
  }
  lerPng(caminho, largura, altura);
  return urlLocal(caminho);
}

function carregar(): { artes: Arte[]; colecoes: Colecao[]; excluidas: number } {
  const artes: Arte[] = [];
  const colecoes: Colecao[] = [];
  const ids = new Map<string, string>();
  let excluidas = 0;
  const pastas = readdirSync(diretorio, { withFileTypes: true })
    .filter(entrada => entrada.isDirectory()).map(entrada => entrada.name).sort();

  for (const pasta of pastas) {
    const arquivo = resolve(diretorio, pasta, 'entregas.json');
    if (!existsSync(arquivo)) continue;
    const manifesto = objeto(JSON.parse(readFileSync(arquivo, 'utf8').replace(/^\uFEFF/, '')), arquivo);
    if (!Array.isArray(manifesto.imagens)) throw new Error(`${pasta}/entregas.json: imagens deve ser uma lista.`);
    const galeria = resolve(diretorio, pasta, 'index.html');
    const colecao: Colecao = {
      pasta, nome: texto(manifesto.colecao, `${pasta}.colecao`),
      data: texto(manifesto.data, `${pasta}.data`),
      galeria: existsSync(galeria) ? urlLocal(galeria) : null, manifesto: urlLocal(arquivo),
    };
    const quantidadeInicial = artes.length;
    for (const [indice, valor] of manifesto.imagens.entries()) {
      const contexto = `${pasta}/entregas.json.imagens[${indice}]`;
      const item = objeto(valor, contexto);
      if (item.final === false || !statusFinais.has(String(item.status))) {
        excluidas += 1;
        continue;
      }
      const id = texto(item.id, `${contexto}.id`);
      const chaveId = id.toLocaleUpperCase('pt-BR');
      if (ids.has(chaveId)) {
        throw new Error(`ID final duplicado: ${id}, em ${ids.get(chaveId)} e ${contexto}. Marque a versão substituída com final=false antes de regenerar.`);
      }
      ids.set(chaveId, contexto);
      const largura = inteiro(item.largura, `${contexto}.largura`);
      const altura = inteiro(item.altura, `${contexto}.altura`);
      artes.push({
        id, tema: texto(item.tema, `${contexto}.tema`), linguagem: texto(item.linguagem, `${contexto}.linguagem`),
        proporcao: texto(item.proporcao_nominal, `${contexto}.proporcao_nominal`), largura, altura,
        caminho: resolverImagem(item.caminho, contexto, largura, altura),
        textoAlternativo: texto(item.texto_alternativo, `${contexto}.texto_alternativo`), colecao,
      });
    }
    if (artes.length > quantidadeInicial) colecoes.push(colecao);
  }
  artes.sort((a, b) => a.id.localeCompare(b.id, 'pt-BR', { numeric: true, sensitivity: 'base' }));
  return { artes, colecoes, excluidas };
}

function nomeFormato(proporcao: string): string {
  const nomes: Record<string, string> = {
    '1:1': 'Quadrado', '3:2': 'Horizontal', '16:9': 'Panorâmico', '4:5': 'Retrato', '9:16': 'Vertical',
  };
  return nomes[proporcao] ? `${nomes[proporcao]} · ${proporcao}` : proporcao;
}

function nomeData(data: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return data;
  return data.split('-').reverse().join('/');
}

function gerar(artes: Arte[], colecoes: Colecao[]): string {
  const proporcoes = [...new Set(artes.map(arte => arte.proporcao))].sort();
  const figuras = artes.map((arte, indice) => `
      <figure class="arte" data-colecao="${escapar(arte.colecao.pasta)}" data-formato="${escapar(arte.proporcao)}" data-busca="${escapar(normalizar(`${arte.id} ${arte.tema} ${arte.linguagem}`))}">
        <a class="imagem" href="${arte.caminho}" aria-label="${escapar(`Abrir original: ${arte.tema}`)}">
          <img src="${arte.caminho}" alt="${escapar(arte.textoAlternativo)}" width="${arte.largura}" height="${arte.altura}" loading="${indice < 3 ? 'eager' : 'lazy'}" decoding="async">
          <span class="abrir" aria-hidden="true">Ver original ↗</span>
        </a>
        <figcaption>
          <div class="linha-arte"><span>${escapar(arte.id)}</span><span>${escapar(nomeFormato(arte.proporcao))}</span></div>
          <h2>${escapar(arte.tema)}</h2>
          <p class="linguagem">${escapar(arte.linguagem)}</p>
          <div class="arquivo"><span>${arte.largura} × ${arte.altura} px</span><a href="${arte.caminho}" download>Baixar PNG <span aria-hidden="true">↓</span></a></div>
          <a class="origem" href="${arte.colecao.galeria || arte.colecao.manifesto}">${escapar(arte.colecao.nome)} <span aria-hidden="true">↗</span></a>
        </figcaption>
      </figure>`).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="Acervo de artes autorais do Saúde Pet. Explore temas, linguagens e formatos com as imagens completas.">
  <link rel="icon" href="data:,">
  <title>Saúde Pet · Mundos visuais</title>
  <style>
    :root{--tinta:#173b3c;--petroleo:#07595b;--turquesa:#19a4a7;--laranja:#f58235;--papel:#faf8f2;--linha:#d6e2dc;--cinza:#536d6b}
    *{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--papel);color:var(--tinta);font:16px/1.55 Arial,Helvetica,sans-serif}a{color:inherit;text-underline-offset:4px}button,input,select{font:inherit}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible{outline:3px solid var(--laranja);outline-offset:4px}[hidden]{display:none!important}.wrap{width:min(1460px,calc(100% - 88px));margin:auto}
    .pular{position:fixed;left:16px;top:-80px;padding:12px;background:var(--tinta);color:white;z-index:10}.pular:focus{top:16px}.topo{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:30px 0;border-bottom:1px solid var(--linha)}.marca{width:162px;height:auto;display:block}.assinatura{font-size:.72rem;letter-spacing:.14em;text-transform:uppercase;color:var(--cinza)}.topo a{text-decoration:none;font-size:.78rem;font-weight:700}
    .abertura{display:grid;grid-template-columns:1.2fr .8fr;gap:72px;align-items:end;padding:70px 0 54px}.sobretitulo{display:flex;align-items:center;gap:12px;font-size:.72rem;font-weight:700;letter-spacing:.17em;text-transform:uppercase;color:var(--petroleo);margin:0 0 22px}.sobretitulo:before{content:'';width:28px;height:3px;background:var(--laranja)}h1{font:400 clamp(3rem,6.2vw,6.5rem)/.98 Georgia,'Times New Roman',serif;letter-spacing:-.055em;margin:0}h1 em{color:var(--petroleo);font-weight:400}.apresentacao{color:var(--cinza);max-width:470px;font-size:1.06rem;line-height:1.75;margin:0 0 24px}.numeros{display:flex;gap:28px;padding-top:22px;border-top:1px solid var(--linha)}.numeros strong{font-family:Georgia,'Times New Roman',serif;display:block;font-size:2.6rem;font-weight:400;line-height:1.1;color:var(--tinta)}.numeros span{font-size:.72rem;color:var(--cinza)}
    .faixa{border-top:1px solid var(--linha);border-bottom:1px solid var(--linha);padding:15px 0;display:flex;justify-content:space-between;gap:20px;font-size:.76rem;color:var(--cinza)}.faixa strong{font-weight:400;color:var(--petroleo)}.filtros{display:grid;grid-template-columns:minmax(230px,1.6fr) minmax(160px,1fr) minmax(140px,.7fr) auto;gap:18px;align-items:end;padding:28px 0 24px}.campo label{display:block;font-size:.7rem;font-weight:700;margin-bottom:8px;color:var(--cinza);letter-spacing:.03em}.campo input,.campo select{width:100%;height:46px;border:1px solid #bdcfca;border-radius:4px;padding:0 13px;background:#fffefb;color:var(--tinta);font-size:.87rem}.campo input::placeholder{color:#6b807d}.limpar{height:46px;border:0;background:transparent;color:var(--petroleo);cursor:pointer;text-decoration:underline;text-underline-offset:4px;font-size:.8rem;padding:0 6px}.resultado{display:flex;justify-content:space-between;gap:20px;color:var(--cinza);font-size:.76rem;margin:0 0 26px}.resultado p{margin:0}
    .galeria{columns:3;column-gap:30px;padding-bottom:30px}.arte{display:inline-block;width:100%;margin:0 0 45px;break-inside:avoid}.imagem{display:block;position:relative;background:#edece4;border-radius:4px;text-decoration:none}.imagem img{display:block;width:100%;height:auto;border-radius:4px}.imagem:hover{outline:2px solid var(--turquesa);outline-offset:4px}.abrir{position:absolute;right:12px;bottom:12px;background:rgba(250,248,242,.95);color:var(--tinta);font-size:.69rem;line-height:1.4;padding:7px 10px;border-radius:3px;opacity:0;transition:opacity .16s}.imagem:hover .abrir,.imagem:focus-visible .abrir{opacity:1}figcaption{padding-top:17px}.linha-arte{display:flex;justify-content:space-between;gap:12px;color:var(--petroleo);font-size:.65rem;text-transform:uppercase;letter-spacing:.07em}.arte h2{font:400 1.45rem/1.19 Georgia,'Times New Roman',serif;letter-spacing:-.02em;margin:12px 0 9px}.linguagem{font-size:.8rem;color:var(--cinza);margin:0 0 16px}.arquivo{border-top:1px solid var(--linha);padding-top:10px;display:flex;justify-content:space-between;gap:12px;font-size:.71rem;color:var(--cinza)}.arquivo a{color:var(--petroleo);font-weight:700;text-decoration:none}.origem{display:inline-block;margin-top:10px;font-size:.67rem;color:var(--cinza);text-decoration:none}.origem:hover,.arquivo a:hover{text-decoration:underline}.vazio{padding:70px 16px 90px;text-align:center;border-top:1px solid var(--linha)}.vazio h2{font:400 2rem Georgia,'Times New Roman',serif}.vazio p{color:var(--cinza)}
    .colecoes{border-top:1px solid var(--linha);padding:35px 0 40px;display:grid;grid-template-columns:.6fr 1.4fr;gap:36px}.colecoes h2{font:400 2rem Georgia,'Times New Roman',serif;letter-spacing:-.035em;margin:0}.colecoes ul{list-style:none;padding:0;margin:0}.colecoes li{display:flex;justify-content:space-between;align-items:baseline;gap:18px;padding:12px 0;border-bottom:1px solid var(--linha)}.colecoes li:first-child{padding-top:0}.colecoes a{font-size:.83rem}.colecoes small{color:var(--cinza);white-space:nowrap}.rodape{padding:28px 0 42px;border-top:1px solid var(--linha);display:flex;justify-content:space-between;gap:28px;color:var(--cinza);font-size:.72rem}.rodape p{margin:0;max-width:580px}.rodape a{white-space:nowrap}
    @media(min-width:1550px){.galeria{column-gap:38px}}@media(max-width:1100px){.wrap{width:calc(100% - 56px)}.abertura{gap:38px}.galeria{columns:2}.filtros{grid-template-columns:1.3fr 1fr .8fr}.limpar{grid-column:3;height:auto;justify-self:end}.numeros{gap:20px}}@media(max-width:720px){.wrap{width:calc(100% - 36px)}.topo{padding:22px 0}.marca{width:135px}.assinatura{display:none}.abertura{grid-template-columns:1fr;padding:40px 0 28px;gap:25px}.apresentacao{font-size:.95rem;max-width:100%;margin-bottom:20px}h1{font-size:clamp(3.5rem,11.5vw,5rem)}.numeros{gap:32px}.numeros strong{font-size:2.15rem}.faixa{display:block}.faixa span{display:block;margin-top:5px}.filtros{grid-template-columns:1fr 1fr;gap:14px;padding:22px 0 20px}.campo-busca{grid-column:1/-1}.limpar{grid-column:1/-1;justify-self:end}.resultado{font-size:.72rem}.galeria{columns:1}.arte{margin-bottom:36px}.arte h2{font-size:1.55rem}.abrir{opacity:1}.colecoes{grid-template-columns:1fr;gap:24px}.colecoes li{display:block}.colecoes small{display:block;margin-top:7px}.rodape{display:block}.rodape a{display:inline-block;margin-top:16px}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.abrir{transition:none}}
  </style>
</head>
<body>
  <a class="pular" href="#acervo">Pular para as artes</a>
  <div class="wrap">
    <nav class="topo" aria-label="Navegação do acervo">
      <img class="marca" src="../../frontend/public/brand/logo-completa-290.png" alt="Saúde Pet" width="290" height="100">
      <span class="assinatura">Acervo editorial · Saúde Pet</span>
      <a href="../BLOG_DIRECAO_VISUAL.md">Direção visual ↗</a>
    </nav>
    <header class="abertura">
      <div><p class="sobretitulo">Uma marca. Muitas histórias.</p><h1>Todo tema tem<br>seu próprio <em>mundo.</em></h1></div>
      <div><p class="apresentacao">Tem espaço para o riso, o afeto, a curiosidade e o cuidado. Cada história encontra uma linguagem — e o Saúde Pet aparece nos detalhes.</p>
        <div class="numeros" aria-label="Números do acervo"><div><strong>${artes.length}</strong><span>artes finais</span></div><div><strong>${colecoes.length}</strong><span>coleções</span></div><div><strong>${proporcoes.length}</strong><span>formatos</span></div></div>
      </div>
    </header>
    <div class="faixa"><strong>Fotografia, desenho, humor e imaginação.</strong><span>Imagens completas, preservadas em suas proporções originais.</span></div>
    <main id="acervo">
      <form class="filtros" id="filtros" role="search" aria-label="Encontrar uma arte">
        <div class="campo campo-busca"><label for="busca">Tema ou estilo</label><input id="busca" type="search" placeholder="Busque por gato, aquarela, ANC-001…" autocomplete="off"></div>
        <div class="campo"><label for="colecao">Coleção</label><select id="colecao"><option value="">Todas as coleções</option>${colecoes.map(colecao => `<option value="${escapar(colecao.pasta)}">${escapar(colecao.nome)} · ${escapar(nomeData(colecao.data))}</option>`).join('')}</select></div>
        <div class="campo"><label for="formato">Formato</label><select id="formato"><option value="">Todos os formatos</option>${proporcoes.map(proporcao => `<option value="${escapar(proporcao)}">${escapar(nomeFormato(proporcao))}</option>`).join('')}</select></div>
        <button class="limpar" type="reset">Limpar filtros</button>
      </form>
      <div class="resultado"><p id="contagem" role="status" aria-live="polite">${artes.length} ${artes.length === 1 ? 'arte' : 'artes'} no acervo</p><p>Toque na imagem para abrir o original</p></div>
      <noscript><p>A busca e os filtros precisam de JavaScript. Todas as artes estão disponíveis abaixo.</p></noscript>
      <div class="galeria" id="galeria">${figuras}
      </div>
      <div class="vazio" id="vazio"${artes.length ? ' hidden' : ''}><h2>Nenhuma arte por aqui.</h2><p>Experimente outro tema ou limpe os filtros para explorar o acervo.</p></div>
    </main>
    <section class="colecoes" aria-labelledby="titulo-colecoes"><h2 id="titulo-colecoes">Explore as coleções</h2><ul>${colecoes.map(colecao => `<li><a href="${colecao.galeria || colecao.manifesto}">${escapar(colecao.nome)} ↗</a><small>${escapar(nomeData(colecao.data))} · ${artes.filter(arte => arte.colecao.pasta === colecao.pasta).length} artes · <a href="${colecao.manifesto}">Manifesto</a></small></li>`).join('')}</ul></section>
    <footer class="rodape"><p>Acervo de criação do Saúde Pet. Estar nesta galeria indica uma arte final salva no projeto; a associação e a publicação de cada post são acompanhadas nos manifestos.</p><a href="README.md">Sobre este acervo ↗</a></footer>
  </div>
  <script>
    (() => {
      const busca = document.getElementById('busca');
      const colecao = document.getElementById('colecao');
      const formato = document.getElementById('formato');
      const filtros = document.getElementById('filtros');
      const artes = Array.from(document.querySelectorAll('.arte'));
      const normalizar = valor => valor.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLocaleLowerCase('pt-BR');
      function atualizar() {
        const termos = normalizar(busca.value.trim()).split(/\\s+/).filter(Boolean);
        let quantidade = 0;
        for (const arte of artes) {
          const visivel = (!colecao.value || arte.dataset.colecao === colecao.value)
            && (!formato.value || arte.dataset.formato === formato.value)
            && termos.every(termo => arte.dataset.busca.includes(termo));
          arte.hidden = !visivel;
          if (visivel) quantidade += 1;
        }
        document.getElementById('contagem').textContent = quantidade + (quantidade === 1 ? ' arte encontrada' : ' artes encontradas') + ' de ' + artes.length;
        document.getElementById('vazio').hidden = quantidade > 0;
      }
      busca.addEventListener('input', atualizar);
      colecao.addEventListener('change', atualizar);
      formato.addEventListener('change', atualizar);
      filtros.addEventListener('submit', evento => evento.preventDefault());
      filtros.addEventListener('reset', () => {
        busca.value = ''; colecao.value = ''; formato.value = ''; atualizar();
      });
    })();
  </script>
</body>
</html>
`;
}

try {
  const { artes, colecoes, excluidas } = carregar();
  writeFileSync(destino, gerar(artes, colecoes), 'utf8');
  console.log(`Galeria gerada: ${relative(raiz, destino)} | ${artes.length} artes finais | ${colecoes.length} coleções | ${excluidas} entradas não finais ignoradas.`);
} catch (erro) {
  console.error(`Não foi possível gerar a galeria: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exitCode = 1;
}
