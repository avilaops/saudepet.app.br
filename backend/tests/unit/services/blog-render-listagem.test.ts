/**
 * A listagem servida precisa conter os artigos.
 *
 * Em 01/09/2026, 22 dos 26 endereços do site estavam em "descoberto, no
 * momento não indexado" no Search Console, e o motivo era este: o HTML
 * servido do `/blog` trazia um título, uma frase e um link para ele mesmo.
 * Nenhum artigo tinha caminho de entrada a partir de uma página indexada, e
 * o Google conhecia os endereços apenas pelo sitemap.
 *
 * Página órfã não ranqueia, então este teste existe para a listagem nunca
 * mais voltar a sair vazia sem alguém perceber.
 */
import { renderStaticPageHtml } from '../../../src/services/blog-render.service';

const TEMPLATE = [
  '<!doctype html><html><head><title>x</title>',
  '<meta name="description" content="x" />',
  '</head><body><div id="root"></div></body></html>'
].join('');

const SITE = 'https://saudepet.app.br';

const POSTS = [
  { slug: 'frio-em-curitiba-quais-pets-sofrem-mais', title: 'Frio em Curitiba', excerpt: 'Quem sofre mais no inverno.' },
  { slug: 'gato-parou-de-comer', title: 'Gato parou de comer', excerpt: 'Quanto tempo dá para esperar.' }
];

describe('listagem do blog servida pelo servidor', () => {
  it('desenha um link para cada artigo recebido', () => {
    const html = renderStaticPageHtml(TEMPLATE, 'blog', SITE, { posts: POSTS }) as string;

    expect(html).toContain('href="/blog/frio-em-curitiba-quais-pets-sofrem-mais"');
    expect(html).toContain('href="/blog/gato-parou-de-comer"');
    expect(html).toContain('Frio em Curitiba');
    expect(html).toContain('Quanto tempo dá para esperar.');
  });

  it('a home também aponta para os artigos, e não só para si mesma', () => {
    const html = renderStaticPageHtml(TEMPLATE, 'home', SITE, { posts: POSTS }) as string;

    expect(html).toContain('href="/blog/frio-em-curitiba-quais-pets-sofrem-mais"');
    expect(html).toContain('href="/blog"');
  });

  it('sem artigos, a listagem não finge ter conteúdo', () => {
    const html = renderStaticPageHtml(TEMPLATE, 'blog', SITE, { posts: [] }) as string;

    // A regra de estilo da lista vive sempre no cabeçalho; o que não pode
    // existir é a lista em si.
    expect(html).not.toContain('<ul class="server-list">');
    // E oferece uma saída, em vez de deixar a pessoa num beco.
    expect(html).toContain('href="/"');
  });

  it('escapa o que vem do banco: título de artigo não injeta HTML', () => {
    const html = renderStaticPageHtml(TEMPLATE, 'blog', SITE, {
      posts: [{ slug: 'x', title: '<script>alert(1)</script>', excerpt: 'a "b" & c' }]
    }) as string;

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;b&quot;');
  });

  it('continua funcionando quando ninguém passa artigo nenhum', () => {
    const html = renderStaticPageHtml(TEMPLATE, 'blog', SITE) as string;

    expect(html).toBeTruthy();
    expect(html).toContain('Saúde PET');
  });
});
