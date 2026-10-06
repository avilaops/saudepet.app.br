const {
  renderBlogHtml,
  renderMarkdownHtml,
  renderNotFoundHtml,
  renderPostMarkdown,
  renderStaticPageHtml
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

describe('blog-render.service', () => {
  test('injeta metadata absoluta, canonical e Article JSON-LD', () => {
    const html = renderBlogHtml(template, post, 'https://saudepet.app.br/');
    expect(html).toContain('<title>Primeira consulta do filhote | Saúde PET</title>');
    expect(html).toContain('property="og:type" content="article"');
    expect(html).toContain('https://saudepet.app.br/blog-media/social/consulta-do-filhote.jpg');
    expect(html).toContain('<link rel="canonical" href="https://saudepet.app.br/blog/consulta-do-filhote"');
    expect(html).toContain('"@type":"Article"');
    expect(html).toContain('data-server-content="article"');
    expect(html).toContain('<h2>Antes da consulta</h2>');
    expect(html).toContain('carteira de vacinação');
    expect(html).toContain('Filhote sendo examinado por uma veterinária');
    expect(html).not.toContain('Consulta do <filhote>');
  });

  test('renderiza Markdown permitido e escapa HTML ou links perigosos', () => {
    const html = renderMarkdownHtml('## Cuidados\n\n<script>alert(1)</script>\n\n[ruim](javascript:alert(1))');
    expect(html).toContain('<h2>Cuidados</h2>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('href="javascript:');
  });

  test('gera página institucional com canonical e metadata no servidor', () => {
    const html = renderStaticPageHtml(template, 'faq', 'https://saudepet.app.br');
    expect(html).toContain('<title>Perguntas frequentes sobre atendimento veterinário | Saúde PET</title>');
    expect(html).toContain('rel="canonical" href="https://saudepet.app.br/faq"');
    // WebPage de propósito: FAQPage sem mainEntity é rich result inválido — o
    // FAQPage completo (com as perguntas) é emitido pelo cliente.
    expect(html).toContain('"@type":"WebPage"');
    expect(html).not.toContain('"@type":"FAQPage"');
    expect(html).toContain('<h1>Perguntas frequentes</h1>');
  });

  test('antecipa a imagem responsiva do primeiro banner na home', () => {
    const html = renderStaticPageHtml(template, 'home', 'https://saudepet.app.br', {
      bannerImages: {
        mobile: 'https://cdn.example.com/banner-mobile.webp',
        desktop: 'https://cdn.example.com/banner-desktop.webp'
      }
    });
    expect(html).toContain('rel="preconnect" href="https://cdn.example.com"');
    expect(html).toContain('href="https://cdn.example.com/banner-mobile.webp" media="(max-width: 768px)"');
    expect(html).toContain('href="https://cdn.example.com/banner-desktop.webp" media="(min-width: 769px)"');
  });

  test('gera versão Markdown canônica do artigo', () => {
    const markdown = renderPostMarkdown(post, 'https://saudepet.app.br');
    expect(markdown).toContain('# Consulta do <filhote>');
    expect(markdown).toContain('URL canônica: https://saudepet.app.br/blog/consulta-do-filhote');
    expect(markdown).toContain('## Antes da consulta');
  });

  test('marca páginas indisponíveis como noindex', () => {
    const html = renderNotFoundHtml(template, 'https://saudepet.app.br');
    expect(html).toContain('Artigo não encontrado | Saúde PET');
    expect(html).toContain('name="robots" content="noindex,nofollow"');
  });
});
