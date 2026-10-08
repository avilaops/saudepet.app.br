/**
 * A montagem do HTML inicial das páginas públicas.
 *
 * O corpo vem dos `.tsx` do app (aqui, de um `entry-server` de teste); este
 * serviço escreve o `<head>` com o que a página declarou no `<Seo>`, manda os
 * dados junto e marca a raiz para o React aproveitar o HTML. O desenho das
 * páginas de verdade é conferido no build do frontend
 * (`frontend/scripts/verificar-ssr.mjs`).
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { chaveDoDado, esquecerCaches, montarPaginaPublica } from '../../../src/services/pagina-publica.service';

const TEMPLATE = `<!doctype html><html><head>
<meta name="description" content="Padrão" />
<meta property="og:title" content="Padrão" />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://saudepet.app.br/og-default.png" />
<meta property="og:image:width" content="1" />
<title>Padrão</title>
<script type="module" crossorigin src="/assets/index-ATUAL.js"></script>
</head><body><div id="root"></div></body></html>`;

const BASE = 'https://saudepet.app.br';
const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'pagina-publica-'));
const arquivoDoTemplate = path.join(pasta, 'index.html');
const ambienteOriginal = { ...process.env };

beforeEach(() => {
  fs.writeFileSync(arquivoDoTemplate, TEMPLATE);
  process.env.FRONTEND_INDEX_PATH = arquivoDoTemplate;
  process.env.FRONTEND_TEMPLATE_URL = 'off';
  process.env.SSR_BUNDLE_PATH = path.resolve(__dirname, '../../fixtures/entry-server-de-teste.cjs');
  esquecerCaches();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ambienteOriginal };
  jest.restoreAllMocks();
});

describe('montarPaginaPublica', () => {
  it('escreve no <head> o que a página declarou no <Seo>', async () => {
    const html = await montarPaginaPublica({ url: '/blog/meu-artigo', baseDoSite: `${BASE}/` });

    expect(html).toContain('<title>Título da página | Saúde PET</title>');
    expect(html).toContain('name="description" content="Descrição &quot;com aspas&quot; &amp; e comercial"');
    expect(html).toContain('<link rel="canonical" href="https://saudepet.app.br/blog/meu-artigo" />');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain('property="og:image" content="https://saudepet.app.br/blog-media/social/capa.jpg"');
    expect(html).toContain('property="og:image:width" content="1200"');
    expect(html).toContain('property="og:image:height" content="630"');
    expect(html).toContain('name="robots" content="index,follow"');
    expect(html).toContain('"@type":"Article"');
    // JSON-LD não fecha a própria tag.
    expect(html).not.toContain('</script><b>');
  });

  it('põe o HTML da página na raiz e avisa o React para aproveitar', async () => {
    const html = await montarPaginaPublica({ url: '/blog?page=2', baseDoSite: BASE });

    expect(html).toContain('<div id="root" data-ssr="1"><main data-url="/blog?page=2"');
    expect(html).toContain('data-base="https://saudepet.app.br"');
    // `$&` no corpo é texto, não instrução de substituição.
    expect(html).toContain('corpo de $& teste');
    // A query não entra no endereço canônico.
    expect(html).toContain('<link rel="canonical" href="https://saudepet.app.br/blog" />');
  });

  it('manda os dados junto, sem deixar conteúdo do banco fechar o script', async () => {
    const dados = { '/public/blog/x': { post: { title: '</script><script>alert(1)</script>', published_at: new Date('2026-08-18T12:00:00.000Z') } } };
    const html = await montarPaginaPublica({ url: '/blog/x', dados, baseDoSite: BASE });

    const trecho = html.match(/<script id="dados-iniciais" type="application\/json">(.*?)<\/script>/s);
    expect(trecho).not.toBeNull();
    expect(trecho![1]).not.toContain('<');
    expect(JSON.parse(trecho![1])['/public/blog/x'].post).toEqual({
      title: '</script><script>alert(1)</script>',
      published_at: '2026-08-18T12:00:00.000Z'
    });
    expect(html).toContain('data-chaves="/public/blog/x"');
  });

  it('página sem dados estruturados próprios leva o vínculo com o site', async () => {
    const html = await montarPaginaPublica({ url: '/contato', baseDoSite: BASE });

    expect(html).toContain('"@type":"WebPage"');
    expect(html).toContain('"isPartOf":{"@type":"WebSite","name":"Saúde PET","url":"https://saudepet.app.br"}');
  });

  it('recurso que não existe sai marcado como noindex', async () => {
    const html = await montarPaginaPublica({ url: '/blog/nao-existe', baseDoSite: BASE });

    expect(html).toContain('name="robots" content="noindex,nofollow"');
  });

  it('acrescenta as dicas de carregamento pedidas pelo controller', async () => {
    const html = await montarPaginaPublica({
      url: '/',
      dicasDoHead: ['<link rel="preload" as="image" href="https://cdn.example.com/banner.webp" />'],
      baseDoSite: BASE
    });

    expect(html).toContain('<link rel="preload" as="image" href="https://cdn.example.com/banner.webp" />\n  </head>');
  });

  it('se a página quebrar ao desenhar, entrega o index.html puro em vez de erro', async () => {
    const html = await montarPaginaPublica({ url: '/quebra', baseDoSite: BASE });

    expect(html).toBe(TEMPLATE);
  });

  it('sem o entry-server, entrega o index.html puro', async () => {
    process.env.SSR_BUNDLE_PATH = path.join(pasta, 'nao-existe.cjs');
    esquecerCaches();
    const html = await montarPaginaPublica({ url: '/faq', baseDoSite: BASE });

    expect(html).toBe(TEMPLATE);
  });

  it('usa o index.html que o web está servindo, não a cópia da imagem', async () => {
    process.env.FRONTEND_TEMPLATE_URL = 'http://web/index.html';
    esquecerCaches();
    const doWeb = TEMPLATE.replace('index-ATUAL.js', 'index-DO-WEB.js');
    const busca = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(doWeb, { status: 200 }));

    const html = await montarPaginaPublica({ url: '/faq', baseDoSite: BASE });

    expect(busca).toHaveBeenCalledWith('http://web/index.html', expect.anything());
    expect(html).toContain('/assets/index-DO-WEB.js');
    expect(html).not.toContain('/assets/index-ATUAL.js');
  });

  it('com o web fora do ar, vale a cópia da imagem', async () => {
    process.env.FRONTEND_TEMPLATE_URL = 'http://web/index.html';
    esquecerCaches();
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

    const html = await montarPaginaPublica({ url: '/faq', baseDoSite: BASE });

    expect(html).toContain('/assets/index-ATUAL.js');
    expect(html).toContain('data-ssr="1"');
  });
});

describe('chaveDoDado', () => {
  it('monta a mesma chave que o frontend procura', () => {
    expect(chaveDoDado('/public/blog', { page: 1, limit: 9, search: '', category: undefined })).toBe('/public/blog?limit=9&page=1');
    expect(chaveDoDado('/public/mercado/lojas/x/produtos', { pagina: 2, limite: 24 })).toBe('/public/mercado/lojas/x/produtos?limite=24&pagina=2');
    expect(chaveDoDado('/public/blog/categories')).toBe('/public/blog/categories');
  });
});
