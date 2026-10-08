const {
  injectPageMetadata,
  renderPostMarkdown,
  responsiveCoverImages
} = require('../../../src/services/blog-render.service');

const template = `<!doctype html><html><head>
<meta name="description" content="Padrão" />
<meta property="og:title" content="Padrão" />
<meta property="og:description" content="Padrão" />
<meta property="og:type" content="website" />
<meta property="og:url" content="https://saudepet.app.br/" />
<meta property="og:image" content="https://saudepet.app.br/og-default.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Padrão" />
<meta name="twitter:description" content="Padrão" />
<meta name="twitter:image" content="https://saudepet.app.br/og-default.png" />
<title>Padrão</title></head><body><div id="root"></div></body></html>`;

const post = {
  slug: 'consulta-do-filhote',
  title: 'Consulta do <filhote>',
  excerpt: 'Resumo seguro',
  seo_title: 'Primeira consulta do filhote',
  seo_description: 'Descrição do artigo',
  social_image: '/blog-media/social/consulta-do-filhote.jpg',
  cover_image: '/blog-media/consulta-do-filhote.webp',
  author_name: 'Equipe Saúde PET',
  cover_image_alt: 'Filhote sendo examinado por uma veterinária',
  content: '## Antes da consulta\n\nLeve a **carteira de vacinação**.\n\n[Agende](/contato) com segurança.',
  category: { name: 'Filhotes e idosos' },
  published_at: new Date('2026-08-18T12:00:00.000Z'),
  scheduled_for: null,
  updated_at: new Date('2026-08-19T12:00:00.000Z')
};

// O HTML das páginas é desenhado pelos `.tsx` do app (ver
// `pagina-publica.service.test.ts` e `frontend/scripts/verificar-ssr.mjs`).
// Aqui ficam o `<head>` e os formatos de texto do blog.
describe('blog-render.service', () => {
  test('injeta metadata, canonical e JSON-LD escapados', () => {
    const html = injectPageMetadata(template, {
      title: 'Consulta do <filhote> | Saúde PET',
      description: 'Descrição do artigo',
      canonical: 'https://saudepet.app.br/blog/consulta-do-filhote',
      type: 'article',
      image: 'https://saudepet.app.br/blog-media/social/consulta-do-filhote.jpg',
      jsonLd: { '@type': 'Article', headline: post.title }
    });
    expect(html).toContain('<title>Consulta do &lt;filhote&gt; | Saúde PET</title>');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain('https://saudepet.app.br/blog-media/social/consulta-do-filhote.jpg');
    expect(html).toContain('<link rel="canonical" href="https://saudepet.app.br/blog/consulta-do-filhote"');
    expect(html).toContain('"@type":"Article"');
    expect(html).not.toContain('Consulta do <filhote>');
  });

  test('monta as larguras da capa para o preload', () => {
    const capa = responsiveCoverImages('https://saudepet.app.br', post.cover_image);
    expect(capa.original).toBe('https://saudepet.app.br/blog-media/consulta-do-filhote.webp');
    expect(capa.srcset).toContain('consulta-do-filhote-640.webp 640w');
    expect(capa.srcset).toContain('consulta-do-filhote.webp 1280w');
  });

  test('gera versão Markdown canônica do artigo', () => {
    const markdown = renderPostMarkdown(post, 'https://saudepet.app.br');
    expect(markdown).toContain('# Consulta do <filhote>');
    expect(markdown).toContain('URL canônica: https://saudepet.app.br/blog/consulta-do-filhote');
    expect(markdown).toContain('## Antes da consulta');
  });
});
