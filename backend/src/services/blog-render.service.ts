/**
 * Metadados e formatos de texto do blog (head, markdown, XML).
 *
 * O HTML das páginas não mora mais aqui: desde 08/10/2026 ele é desenhado
 * pelos `.tsx` do app (ver `pagina-publica.service.ts`).
 */

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

/**
 * Endereços das páginas institucionais, para o sitemap. O conteúdo e o título
 * de cada uma vivem no `.tsx` da página (`frontend/src/pages/public`).
 */
const caminhosDasPaginasEstaticas = ['/', '/faq', '/blog', '/contato', '/privacidade'];

module.exports = {
  absoluteUrl,
  caminhosDasPaginasEstaticas,
  escapeHtml,
  escapeXml,
  injectPageMetadata,
  renderPostMarkdown,
  responsiveCoverImages
};

export {
  absoluteUrl,
  caminhosDasPaginasEstaticas,
  escapeHtml,
  escapeXml,
  injectPageMetadata,
  renderPostMarkdown,
  responsiveCoverImages
};
