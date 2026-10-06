/**
 * O recorte de `BlogPost` que o render usa. Datas chegam como `Date` do
 * Prisma ou como string ISO (o seed e o cache serializado), e `new Date(x)`
 * aceita as duas.
 */
export interface PostParaRender {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  author_name: string;
  seo_title?: string | null;
  seo_description?: string | null;
  social_image?: string | null;
  cover_image?: string | null;
  cover_image_alt?: string | null;
  published_at?: Date | string | null;
  scheduled_for?: Date | string | null;
  updated_at?: Date | string | null;
  category?: { name?: string | null } | null;
}

export interface MetadadosDaPagina {
  title: string;
  description: string;
  canonical: string;
  type?: string;
  image: string;
  jsonLd: unknown;
  robots?: string;
}

export interface PaginaEstatica {
  path: string;
  title: string;
  description: string;
  heading: string;
  intro: string;
  type: string;
}

export interface OpcoesDaPaginaEstatica {
  bannerImages?: { mobile?: string | null; desktop?: string | null } | null;
  /**
   * Artigos para desenhar no HTML servido do `/blog` e da home.
   *
   * Sem eles a listagem saía com título, uma frase e um link para ela
   * mesma: nenhum artigo era alcançável a partir de uma página indexada.
   * O Google conhecia os endereços só pelo sitemap, e endereço órfão vira
   * "descoberto, no momento não indexado", que era o estado de 22 dos 26.
   */
  posts?: { slug: string; title: string; excerpt: string }[] | null;
}

function escapeHtml(value: unknown = ''): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeXml(value: unknown = ''): string {
  return escapeHtml(value);
}

function absoluteUrl(base: string, value?: string | null): string {
  if (!value) return `${base}/og-default.png`;
  if (/^https?:\/\//i.test(value)) return value;
  return `${base}${value.startsWith('/') ? value : `/${value}`}`;
}

function replaceMeta(html: string, attribute: string, key: string, content: unknown): string {
  const escaped = escapeHtml(content);
  const pattern = new RegExp(`<meta\\s+${attribute}=["']${key}["'][^>]*>`, 'i');
  const tag = `<meta ${attribute}="${key}" content="${escaped}" />`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

function responsiveCoverImages(base: string, value?: string | null): { original: string; srcset: string } {
  const original = absoluteUrl(base, value);
  if (!/\.webp(?:\?.*)?$/i.test(original)) return { original, srcset: original };
  return {
    original,
    srcset: [
      `${original.replace(/\.webp$/i, '-640.webp')} 640w`,
      `${original.replace(/\.webp$/i, '-960.webp')} 960w`,
      `${original} 1280w`
    ].join(', ')
  };
}

function renderInlineMarkdown(value: unknown = ''): string {
  const source = String(value);
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*/g;
  let cursor = 0;
  let output = '';
  for (const match of source.matchAll(pattern)) {
    output += escapeHtml(source.slice(cursor, match.index));
    if (match[3] !== undefined) {
      output += `<strong>${escapeHtml(match[3])}</strong>`;
    } else if (match[2].startsWith('/') || /^https?:\/\//i.test(match[2])) {
      const external = /^https?:\/\//i.test(match[2]);
      output += `<a href="${escapeHtml(match[2])}"${external ? ' rel="noopener noreferrer"' : ''}>${escapeHtml(match[1])}</a>`;
    } else {
      output += escapeHtml(match[1]);
    }
    cursor = match.index + match[0].length;
  }
  output += escapeHtml(source.slice(cursor));
  return output;
}

function renderMarkdownHtml(content: unknown = ''): string {
  const blocks = String(content).replace(/\r/g, '').split(/\n{2,}/).filter(Boolean);
  return blocks.map((block) => {
    if (block.startsWith('### ')) return `<h3>${renderInlineMarkdown(block.slice(4))}</h3>`;
    if (block.startsWith('## ')) return `<h2>${renderInlineMarkdown(block.slice(3))}</h2>`;
    if (block.startsWith('# ')) return `<h2>${renderInlineMarkdown(block.slice(2))}</h2>`;
    if (block.startsWith('> ')) return `<blockquote>${renderInlineMarkdown(block.slice(2))}</blockquote>`;
    const lines = block.split('\n');
    if (lines.every((line) => line.startsWith('- '))) {
      return `<ul>${lines.map((line) => `<li>${renderInlineMarkdown(line.slice(2))}</li>`).join('')}</ul>`;
    }
    return `<p>${lines.map((line) => renderInlineMarkdown(line)).join('<br />')}</p>`;
  }).join('\n');
}

function injectPageMetadata(
  template: string,
  { title, description, canonical, type = 'website', image, jsonLd, robots = 'index,follow' }: MetadadosDaPagina
): string {
  let html = template.replace(/<title>.*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
  html = replaceMeta(html, 'name', 'description', description);
  html = replaceMeta(html, 'name', 'robots', robots);
  html = replaceMeta(html, 'property', 'og:title', title);
  html = replaceMeta(html, 'property', 'og:description', description);
  html = replaceMeta(html, 'property', 'og:type', type);
  html = replaceMeta(html, 'property', 'og:url', canonical);
  html = replaceMeta(html, 'property', 'og:image', image);
  html = replaceMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = replaceMeta(html, 'name', 'twitter:title', title);
  html = replaceMeta(html, 'name', 'twitter:description', description);
  html = replaceMeta(html, 'name', 'twitter:image', image);
  const structuredData: unknown[] = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return html.replace('</head>', `    <link rel="canonical" href="${escapeHtml(canonical)}" />\n${structuredData.filter(Boolean).map((item, index) => `    <script id="server-page-json-ld-${index}" type="application/ld+json">${JSON.stringify(item).replace(/</g, '\\u003c')}</script>`).join('\n')}\n  </head>`);
}

const snapshotStyles = `<style id="server-content-styles">
  #root>[data-server-content]{box-sizing:border-box;color:#16383d;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0 auto;max-width:920px;padding:56px 24px 80px}
  #root>[data-server-content] h1{font-size:clamp(2.2rem,6vw,4.6rem);font-weight:500;letter-spacing:-.045em;line-height:1.04;margin:20px 0}
  #root>[data-server-content] h2{font-size:1.75rem;line-height:1.25;margin:42px 0 14px}
  #root>[data-server-content] h3{font-size:1.25rem;margin:30px 0 12px}
  #root>[data-server-content] p,#root>[data-server-content] li{font-size:1.075rem;line-height:1.8}
  #root>[data-server-content] a{color:#008b91}
  #root>[data-server-content] img{aspect-ratio:16/9;border-radius:28px;display:block;height:auto;margin:34px 0;object-fit:cover;width:100%}
  #root>[data-server-content] blockquote{background:#eefafa;border-left:4px solid #16aeb4;border-radius:0 16px 16px 0;margin:28px 0;padding:18px 22px}
  #root>[data-server-content] .server-kicker{color:#007d83;font-size:.78rem;font-weight:800;letter-spacing:.12em;text-transform:uppercase}
  #root>[data-server-content] .server-excerpt{color:#527078;font-size:1.25rem;line-height:1.55}
  #root>[data-server-content] .server-meta{color:#657b81;font-size:.875rem;margin:18px 0}
  #root>[data-server-content] .server-list{list-style:none;margin:34px 0 0;padding:0}
  #root>[data-server-content] .server-list li{border-top:1px solid #dcebec;padding:18px 0}
  #root>[data-server-content] .server-list a{display:block;font-size:1.15rem;font-weight:600;text-decoration:none}
  #root>[data-server-content] .server-list span{color:#527078;display:block;font-size:.98rem;line-height:1.6;margin-top:6px}
  @media(max-width:620px){#root>[data-server-content]{padding:36px 18px 64px}#root>[data-server-content] h1{font-size:2.5rem}#root>[data-server-content] img{border-radius:20px}}
</style>`;

function replaceRoot(template: string, content: string): string {
  return template.replace('<div id="root"></div>', `<div id="root">${content}</div>`);
}

function renderBlogHtml(template: string, post: PostParaRender, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const title = `${post.seo_title || post.title} | Saúde PET`;
  const description = post.seo_description || post.excerpt;
  const canonical = `${base}/blog/${post.slug}`;
  const image = absoluteUrl(base, post.social_image || post.cover_image);
  const cover = responsiveCoverImages(base, post.cover_image);
  const published = post.published_at || post.scheduled_for;
  const categoryName = post.category?.name || 'Saúde animal';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description,
    image,
    author: { '@type': 'Organization', name: post.author_name },
    publisher: {
      '@type': 'Organization',
      name: 'Saúde PET',
      logo: { '@type': 'ImageObject', url: `${base}/brand/logo-completa.png` }
    },
    datePublished: published,
    dateModified: post.updated_at,
    mainEntityOfPage: canonical
  };

  let html = injectPageMetadata(template, { title, description, canonical, type: 'article', image, jsonLd });
  html = html.replace('</head>', `    <link rel="preload" as="image" href="${escapeHtml(cover.original)}" imagesrcset="${escapeHtml(cover.srcset)}" imagesizes="(max-width: 620px) calc(100vw - 36px), 872px" fetchpriority="high" />\n    ${snapshotStyles}\n  </head>`);
  const snapshot = `<main data-server-content="article">
    <nav aria-label="Navegação estrutural"><a href="/">Início</a> / <a href="/blog">Blog</a></nav>
    <p class="server-kicker">${escapeHtml(categoryName)}</p>
    <h1>${escapeHtml(post.title)}</h1>
    <p class="server-excerpt">${escapeHtml(post.excerpt)}</p>
    <p class="server-meta">Por ${escapeHtml(post.author_name)} · ${published ? new Date(published).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : ''}</p>
    <img src="${escapeHtml(cover.original)}" srcset="${escapeHtml(cover.srcset)}" sizes="(max-width: 620px) calc(100vw - 36px), 872px" width="1280" height="720" alt="${escapeHtml(post.cover_image_alt || post.title)}" fetchpriority="high" />
    <article>${renderMarkdownHtml(post.content)}</article>
  </main>`;
  return replaceRoot(html, snapshot);
}

const staticPages: Record<string, PaginaEstatica> = {
  home: {
    path: '/',
    title: 'Saúde PET — Veterinário em casa com cuidado e proximidade',
    description: 'Solicite atendimento veterinário domiciliar e acompanhe cada etapa do cuidado do seu pet pelo Saúde PET.',
    heading: 'Cuidado veterinário que chega até você',
    intro: 'Um canal simples para solicitar atendimento e acompanhar a jornada do seu pet com clareza e contato humano.',
    type: 'WebPage'
  },
  faq: {
    path: '/faq',
    title: 'Perguntas frequentes sobre atendimento veterinário | Saúde PET',
    description: 'Tire dúvidas sobre atendimento veterinário em casa, agendamento, profissionais, pagamentos, privacidade e cadastro.',
    heading: 'Perguntas frequentes',
    intro: 'Encontre respostas sobre como funciona o Saúde PET e saiba como solicitar atendimento.',
    // WebPage de propósito: FAQPage sem mainEntity é rich result inválido —
    // o JSON-LD FAQPage completo é emitido pelo cliente, que tem as perguntas.
    type: 'WebPage'
  },
  blog: {
    path: '/blog',
    title: 'Blog de saúde e cuidados com pets | Saúde PET',
    description: 'Conteúdo confiável sobre prevenção, bem-estar, comportamento e cuidados veterinários para cães e gatos.',
    heading: 'Conteúdo para cuidar melhor do seu pet',
    intro: 'Informação prática e responsável para apoiar tutores em cada fase da vida do animal.',
    type: 'CollectionPage'
  },
  contato: {
    path: '/contato',
    title: 'Contato | Saúde PET',
    description: 'Fale com o Saúde PET para solicitar atendimento veterinário ou tirar dúvidas sobre a plataforma.',
    heading: 'Fale com o Saúde PET',
    intro: 'Escolha o canal de contato disponível e conte como podemos ajudar você e seu pet.',
    type: 'ContactPage'
  },
  privacidade: {
    path: '/privacidade',
    title: 'Política de Privacidade | Saúde PET',
    description: 'Entenda como o Saúde PET coleta, utiliza, protege e permite o exercício de direitos sobre dados pessoais.',
    heading: 'Política de Privacidade',
    intro: 'Transparência sobre o uso de dados pessoais e os direitos dos titulares no Saúde PET.',
    type: 'WebPage'
  }
};

function renderStaticPageHtml(
  template: string,
  pageKey: string,
  siteUrl: string,
  options: OpcoesDaPaginaEstatica = {}
): string | null {
  const page = staticPages[pageKey];
  if (!page) return null;
  const base = siteUrl.replace(/\/$/, '');
  const canonical = `${base}${page.path}`;
  const image = `${base}/og-default.png`;
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': page.type,
    name: page.heading,
    description: page.description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Saúde PET', url: base }
  };
  let html = injectPageMetadata(template, { title: page.title, description: page.description, canonical, image, jsonLd: structuredData });
  if (pageKey === 'home' && options.bannerImages) {
    const { mobile, desktop } = options.bannerImages;
    const validMobile = /^https?:\/\//i.test(mobile || '') ? mobile : null;
    const validDesktop = /^https?:\/\//i.test(desktop || '') ? desktop : null;
    const origin = validMobile || validDesktop ? new URL(validMobile || validDesktop || '').origin : null;
    const hints = [
      origin ? `<link rel="preconnect" href="${escapeHtml(origin)}" />` : null,
      validMobile ? `<link rel="preload" as="image" href="${escapeHtml(validMobile)}" media="(max-width: 768px)" fetchpriority="high" />` : null,
      validDesktop ? `<link rel="preload" as="image" href="${escapeHtml(validDesktop)}" media="(min-width: 769px)" fetchpriority="high" />` : null
    ].filter(Boolean).join('\n    ');
    if (hints) html = html.replace('</head>', `    ${hints}\n  </head>`);
  }
  html = html.replace('</head>', `    ${snapshotStyles}\n  </head>`);

  // A lista de artigos é o que dá caminho de entrada para cada texto:
  // inteira no `/blog`, e os mais recentes na home.
  const artigos = options.posts || [];
  const itens = artigos.map((artigo) =>
    `<li><a href="/blog/${escapeHtml(artigo.slug)}">${escapeHtml(artigo.title)}</a><span>${escapeHtml(artigo.excerpt)}</span></li>`
  ).join('');
  const listaDeArtigos = artigos.length ? `<ul class="server-list">${itens}</ul>` : '';

  const chamada = pageKey === 'blog'
    ? (artigos.length ? '' : '<p><a href="/">Voltar ao início</a></p>')
    : `<p><a href="${pageKey === 'home' ? '/blog' : '/contato'}">${pageKey === 'home' ? 'Ver todos os artigos' : 'Solicitar contato'}</a></p>`;

  const snapshot = `<main data-server-content="page"><p class="server-kicker">Saúde PET</p>`
    + `<h1>${escapeHtml(page.heading)}</h1>`
    + `<p class="server-excerpt">${escapeHtml(page.intro)}</p>`
    + listaDeArtigos
    + chamada
    + '</main>';
  return replaceRoot(html, snapshot);
}

function renderPostMarkdown(post: PostParaRender, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  const published = post.published_at || post.scheduled_for;
  return [
    `# ${post.title}`,
    '',
    post.excerpt,
    '',
    `- Autor: ${post.author_name}`,
    `- Categoria: ${post.category?.name || 'Saúde animal'}`,
    published ? `- Publicado em: ${new Date(published).toISOString()}` : null,
    `- URL canônica: ${base}/blog/${post.slug}`,
    '',
    post.cover_image ? `![${post.cover_image_alt || post.title}](${absoluteUrl(base, post.cover_image)})` : null,
    '',
    post.content,
    '',
    `Fonte oficial: ${base}/blog/${post.slug}`
  ].filter((line) => line !== null).join('\n');
}

function renderNotFoundHtml(template: string, siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '');
  let html = template.replace(/<title>.*?<\/title>/i, '<title>Artigo não encontrado | Saúde PET</title>');
  html = replaceMeta(html, 'name', 'description', 'O conteúdo solicitado não está disponível.');
  html = replaceMeta(html, 'name', 'robots', 'noindex,nofollow');
  html = replaceMeta(html, 'property', 'og:url', `${base}/blog`);
  return replaceRoot(html, '<main data-server-content="not-found"><h1>Página não encontrada</h1><p>O conteúdo solicitado não está disponível.</p><p><a href="/blog">Voltar ao blog</a></p></main>');
}

module.exports = {
  absoluteUrl,
  escapeHtml,
  escapeXml,
  // Reaproveitados pela vitrine pública do mercado (`mercado-render.service`),
  // que precisa do mesmo HTML inicial com metadata e JSON-LD que o blog tem.
  injectPageMetadata,
  replaceRoot,
  snapshotStyles,
  renderBlogHtml,
  renderMarkdownHtml,
  renderNotFoundHtml,
  renderPostMarkdown,
  renderStaticPageHtml,
  staticPages
};

export {
  absoluteUrl,
  escapeHtml,
  escapeXml,
  injectPageMetadata,
  replaceRoot,
  snapshotStyles,
  renderBlogHtml,
  renderMarkdownHtml,
  renderNotFoundHtml,
  renderPostMarkdown,
  renderStaticPageHtml,
  staticPages
};
