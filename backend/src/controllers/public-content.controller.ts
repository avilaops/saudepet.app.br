import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import prisma from '../config/database';
import { avisarNovoLead } from '../services/notificacao-admin.service';
import { asyncHandler, NotFoundError } from '../middleware/error.middleware';
import { resolvePublicTenant } from '../services/public-tenant.service';
import { detectClient, hashRequestIp } from '../utils/request-metadata';
import { applyAnalyticsRetention } from '../services/analytics-retention.service';
import { trackConversion } from '../services/meta-conversions.service';
import { responderAoLead } from '../services/resposta-ao-lead.service';
import bannerController from './banner.controller';
import { urlsDoMercadoParaSitemap } from '../services/mercado/feed.service';
import {
  absoluteUrl,
  caminhosDasPaginasEstaticas,
  escapeHtml,
  escapeXml,
  renderPostMarkdown,
  responsiveCoverImages
} from '../services/blog-render.service';
import { chaveDoDado, montarPaginaPublica, NAO_ENCONTRADO } from '../services/pagina-publica.service';
import type { DadosIniciais } from '../services/pagina-publica.service';
import type { leadSchema, pageViewSchema, paginationQuerySchema } from '../schemas/content.schema';

type LeadInput = z.infer<typeof leadSchema>;
type PageViewInput = z.infer<typeof pageViewSchema>;
type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * `validate(schema)` substitui `req.body`/`req.query` pelo objeto já validado e
 * coagido. O tipo do Express não sabe disso, então cada handler declara o
 * schema pelo qual a rota passou.
 */
const corpoValidado = <T>(req: Request): T => req.body as T;
const queryValidada = <T>(req: Request): T => req.query as unknown as T;

/** `cookie-parser` pendura `cookies` na request; o tipo do Express não o declara. */
const cookiesDaRequisicao = (req: Request): Record<string, string | undefined> | undefined =>
  (req as Request & { cookies?: Record<string, string | undefined> }).cookies;

export const getLandingBanners = asyncHandler(async (req: Request, res: Response) => {
  return bannerController.getPublicBanners(req, res);
});

function rawClientIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  return (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0])?.trim() || req.socket?.remoteAddress;
}

const publicPostWhere = (tenantId: string, now = new Date()): Prisma.BlogPostWhereInput => ({
  tenant_id: tenantId,
  OR: [
    { status: 'publicado', published_at: { lte: now } },
    { status: 'agendado', scheduled_for: { lte: now } }
  ]
});

const postSelect = {
  id: true, slug: true, title: true, excerpt: true, content: true, cover_image: true,
  cover_image_alt: true, author_name: true, tags: true, seo_title: true,
  seo_description: true, social_image: true, published_at: true, scheduled_for: true,
  updated_at: true, category: { select: { id: true, slug: true, name: true } }
} as const satisfies Prisma.BlogPostSelect;

const readingTime = (content = ''): number => Math.max(1, Math.ceil(content.trim().split(/\s+/).length / 220));

export const createLead = asyncHandler(async (req: Request, res: Response) => {
  const corpo = corpoValidado<LeadInput>(req);
  if (corpo.website) return res.status(202).json({ success: true, message: 'Recebemos sua solicitação.' });
  const tenant = await resolvePublicTenant();
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const duplicate = await prisma.lead.findFirst({
    where: {
      tenant_id: tenant.id,
      phone: corpo.phone,
      created_at: { gte: fifteenMinutesAgo }
    },
    select: { id: true }
  });
  if (duplicate) return res.status(200).json({ success: true, duplicate: true, message: 'Sua solicitação já foi recebida.' });

  let session: { id: string } | null = null;
  if (corpo.anonymousSessionId) {
    session = await prisma.visitSession.findUnique({
      where: { tenant_id_anonymous_session_id: { tenant_id: tenant.id, anonymous_session_id: corpo.anonymousSessionId } },
      select: { id: true }
    });
  }
  const lead = await prisma.lead.create({
    data: {
      tenant_id: tenant.id,
      session_id: session?.id || null,
      name: corpo.name,
      phone: corpo.phone,
      email: corpo.email || null,
      city: corpo.city || null,
      state: corpo.state?.toUpperCase() || null,
      pet_name: corpo.petName || null,
      pet_type: corpo.petType || null,
      interest: corpo.interest,
      preferred_contact_time: corpo.preferredContactTime || null,
      privacy_accepted: true,
      privacy_accepted_at: new Date(),
      privacy_purpose: corpo.privacyPurpose,
      source_page: corpo.sourcePage || null,
      referrer: corpo.referrer || null,
      utm_source: corpo.utmSource || null,
      utm_medium: corpo.utmMedium || null,
      utm_campaign: corpo.utmCampaign || null,
      utm_content: corpo.utmContent || null,
      utm_term: corpo.utmTerm || null
    },
    select: { id: true, created_at: true }
  });

  // A landing prometia "nossa equipe fará o contato" e NADA avisava a equipe: o
  // lead ficava esperando alguém abrir `/admin/leads` por conta própria.
  // Best-effort, como o resto daqui — um e-mail que falha não pode transformar
  // um lead capturado em erro na tela de quem o preencheu.
  void avisarNovoLead({
    tenantId: tenant.id,
    lead: {
      ...lead,
      name: corpo.name,
      phone: corpo.phone,
      email: corpo.email || null,
      city: corpo.city || null,
      state: corpo.state?.toUpperCase() || null,
      pet_name: corpo.petName || null,
      pet_type: corpo.petType || null,
      interest: corpo.interest,
      preferred_contact_time: corpo.preferredContactTime || null,
      source_page: corpo.sourcePage || null
    },
    io: req.app.get('io')
  });

  // E a resposta a QUEM deixou o contato. Até agora só a equipe era avisada: a
  // pessoa digitava nome, telefone e o nome do pet e recebia silêncio, sem
  // nenhuma confirmação de que o pedido chegou.
  void responderAoLead({
    name: corpo.name,
    email: corpo.email || null,
    pet_name: corpo.petName || null,
    interest: corpo.interest
  });

  // Best-effort, nunca bloqueia a resposta ao usuário.
  const cookies = cookiesDaRequisicao(req);
  trackConversion('Lead', {
    email: corpo.email,
    phone: corpo.phone,
    ip: rawClientIp(req),
    userAgent: req.headers['user-agent'],
    fbp: cookies?._fbp,
    fbc: cookies?._fbc
  }, { content_name: corpo.interest }).catch(() => {});

  res.status(201).json({ success: true, lead, message: 'Solicitação recebida. Nossa equipe fará o contato pelo canal informado.' });
});

export const trackPageView = asyncHandler(async (req: Request, res: Response) => {
  if (req.user?.tipo_usuario === 'admin' || req.user?.tipo_usuario === 'super_admin') return res.status(204).end();
  const corpo = corpoValidado<PageViewInput>(req);
  const tenant = await resolvePublicTenant();
  await applyAnalyticsRetention(tenant.id);
  const agent = req.get('user-agent') || '';
  const { deviceCategory, browserFamily, isBot } = detectClient(agent);
  if (isBot) return res.status(204).end();

  const session = await prisma.visitSession.upsert({
    where: { tenant_id_anonymous_session_id: { tenant_id: tenant.id, anonymous_session_id: corpo.anonymousSessionId } },
    update: { last_seen_at: new Date() },
    create: {
      tenant_id: tenant.id,
      anonymous_visitor_id: corpo.anonymousVisitorId,
      anonymous_session_id: corpo.anonymousSessionId,
      first_path: corpo.path,
      referrer: corpo.referrer || null,
      utm_source: corpo.utmSource || null,
      utm_medium: corpo.utmMedium || null,
      utm_campaign: corpo.utmCampaign || null,
      utm_content: corpo.utmContent || null,
      utm_term: corpo.utmTerm || null,
      device_category: deviceCategory,
      browser_family: browserFamily,
      ip_hash: hashRequestIp(req),
      is_bot: false
    }
  });

  await prisma.pageView.upsert({
    where: { session_id_navigation_id: { session_id: session.id, navigation_id: corpo.navigationId } },
    update: {},
    create: {
      tenant_id: tenant.id,
      session_id: session.id,
      navigation_id: corpo.navigationId,
      path: corpo.path,
      page_title: corpo.pageTitle || null,
      referrer: corpo.referrer || null,
      utm_source: corpo.utmSource || null,
      utm_medium: corpo.utmMedium || null,
      utm_campaign: corpo.utmCampaign || null,
      utm_content: corpo.utmContent || null,
      utm_term: corpo.utmTerm || null,
      device_category: deviceCategory,
      article_slug: corpo.articleSlug || null
    }
  });
  res.status(202).json({ success: true });
});

/**
 * As funções `dados...` abaixo montam o corpo que a API devolve. O HTML
 * inicial das páginas públicas usa as MESMAS, para o `.tsx` receber no
 * servidor exatamente o que receberia do navegador.
 */
async function dadosDaListagem(
  tenantId: string,
  { page, limit, search, category }: { page: number; limit: number; search?: string | null; category?: string | null }
) {
  const where = publicPostWhere(tenantId);
  // No celular muita gente digita "racao" e "caes", sem acento, e o `contains`
  // do Postgres não casa com "ração" nem "cães". O slug já é o título sem
  // acento, então a busca também passa por ele.
  const searchSlug = search
    ? search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    : '';
  if (search) where.AND = [{ OR: [
    { title: { contains: search, mode: 'insensitive' } },
    { excerpt: { contains: search, mode: 'insensitive' } },
    { tags: { has: search.toLowerCase() } },
    ...(searchSlug ? [{ slug: { contains: searchSlug } }] : [])
  ] }];
  if (category) where.category = { slug: category };
  const [rawPosts, total] = await Promise.all([
    prisma.blogPost.findMany({ where, select: postSelect, orderBy: [{ published_at: 'desc' }, { scheduled_for: 'desc' }], skip: (page - 1) * limit, take: limit }),
    prisma.blogPost.count({ where })
  ]);
  const posts = rawPosts.map(({ content, ...post }) => ({ ...post, reading_time_minutes: readingTime(content) }));
  return { posts, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
}

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.json(await dadosDaListagem(tenant.id, queryValidada<PaginationQuery>(req)));
});

async function dadosDoPost(tenantId: string, slug: string) {
  const post = await prisma.blogPost.findFirst({ where: { ...publicPostWhere(tenantId), slug }, select: postSelect });
  if (!post) return null;
  const related = await prisma.blogPost.findMany({
    where: { ...publicPostWhere(tenantId), id: { not: post.id }, ...(post.category?.id ? { category_id: post.category.id } : {}) },
    select: { slug: true, title: true, excerpt: true, cover_image: true, published_at: true }, take: 3,
    orderBy: { published_at: 'desc' }
  });
  return { post, related };
}

async function dadosDasCategorias(tenantId: string) {
  const categories = await prisma.blogCategory.findMany({
    where: { tenant_id: tenantId, posts: { some: publicPostWhere(tenantId) } },
    select: { id: true, slug: true, name: true, description: true, _count: { select: { posts: true } } },
    orderBy: { name: 'asc' }
  });
  return { categories };
}

/** O mesmo corpo de `GET /v1/public/banners`, que o carrossel da home lê. */
async function dadosDosBanners(tenantId: string) {
  const now = new Date();
  const banners = await prisma.landingBanner.findMany({
    where: {
      tenantId,
      status: 'PUBLISHED',
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }
      ]
    },
    orderBy: { position: 'asc' }
  });
  return { success: true, count: banners.length, banners };
}

export const getPost = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const dados = await dadosDoPost(tenant.id, String(req.params.slug));
  if (!dados) throw new NotFoundError('Artigo não encontrado');
  res.json(dados);
});

// ── HTML inicial das páginas públicas ────────────────────────────────────────
//
// O nginx manda `/`, `/faq`, `/contato`, `/privacidade`, `/blog` e
// `/blog/:slug` para cá. O HTML é o do `.tsx` de cada página, desenhado no
// servidor (`pagina-publica.service`); este arquivo só junta os dados que a
// página pediria à API.

const CACHE_DE_PAGINA = 'public, max-age=300, stale-while-revalidate=3600';
const siteUrl = (): string => process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br';

const CAMINHO_DA_PAGINA: Record<string, string> = {
  home: '/',
  faq: '/faq',
  blog: '/blog',
  contato: '/contato',
  privacidade: '/privacidade'
};

/** Artigos por página na listagem; o `BlogPage.tsx` pede o mesmo número. */
const ARTIGOS_POR_PAGINA = 9;

export const renderPost = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const slug = String(req.params.slug);
  const base = siteUrl().replace(/\/$/, '');
  const dadosDoArtigo = await dadosDoPost(tenant.id, slug);
  const dados: DadosIniciais = { [`/public/blog/${slug}`]: dadosDoArtigo ?? NAO_ENCONTRADO };

  // A capa é a maior imagem da página: o navegador começa a baixá-la antes de
  // chegar ao `<img>`.
  const dicasDoHead: string[] = [];
  if (dadosDoArtigo?.post.cover_image) {
    const capa = responsiveCoverImages(base, dadosDoArtigo.post.cover_image);
    dicasDoHead.push(`<link rel="preload" as="image" href="${escapeHtml(capa.original)}" imagesrcset="${escapeHtml(capa.srcset)}" imagesizes="(max-width: 620px) calc(100vw - 28px), 840px" fetchpriority="high" />`);
  }

  const html = await montarPaginaPublica({ url: `/blog/${slug}`, dados, dicasDoHead, baseDoSite: base });
  if (!dadosDoArtigo) return res.status(404).type('html').send(html);
  res.set('Cache-Control', CACHE_DE_PAGINA);
  return res.type('html').send(html);
});

export const renderPage = asyncHandler(async (req: Request, res: Response) => {
  const pagina = String(req.params.page);
  const caminho = CAMINHO_DA_PAGINA[pagina];
  if (!caminho) return res.status(404).type('text/plain; charset=utf-8').send('Página não encontrada.');

  const dados: DadosIniciais = {};
  const dicasDoHead: string[] = [];
  let url = caminho;

  if (pagina === 'home') {
    const tenant = await resolvePublicTenant();
    const banners = await dadosDosBanners(tenant.id);
    dados['/v1/public/banners'] = banners;
    // O primeiro banner é a maior imagem da home.
    const primeiro = banners.banners[0];
    if (primeiro) {
      const desktop = /^https?:\/\//i.test(primeiro.desktopImageUrl || '') ? primeiro.desktopImageUrl : null;
      const mobile = /^https?:\/\//i.test(primeiro.mobileImageUrl || '') ? primeiro.mobileImageUrl : desktop;
      const origem = mobile || desktop ? new URL(mobile || desktop || '').origin : null;
      if (origem) dicasDoHead.push(`<link rel="preconnect" href="${escapeHtml(origem)}" />`);
      if (mobile) dicasDoHead.push(`<link rel="preload" as="image" href="${escapeHtml(mobile)}" media="(max-width: 768px)" fetchpriority="high" />`);
      if (desktop) dicasDoHead.push(`<link rel="preload" as="image" href="${escapeHtml(desktop)}" media="(min-width: 769px)" fetchpriority="high" />`);
    }
  }

  // A listagem sai do servidor JÁ COM os artigos, e cada página dela tem
  // endereço próprio (`/blog?page=2`). Em 01/09/2026, 22 dos 26 artigos
  // estavam em "descoberto, no momento não indexado": nenhum tinha caminho de
  // entrada a partir de uma página indexada, que é o que acontece com página
  // órfã.
  if (pagina === 'blog') {
    const tenant = await resolvePublicTenant();
    const numero = Math.max(1, Math.floor(Number(req.query.page)) || 1);
    const [listagem, categorias] = await Promise.all([
      dadosDaListagem(tenant.id, { page: numero, limit: ARTIGOS_POR_PAGINA }),
      dadosDasCategorias(tenant.id)
    ]);
    dados[chaveDoDado('/public/blog', { page: numero, limit: ARTIGOS_POR_PAGINA })] = listagem;
    dados['/public/blog/categories'] = categorias;
    if (numero > 1) url = `/blog?page=${numero}`;
  }

  const html = await montarPaginaPublica({ url, dados, dicasDoHead, baseDoSite: siteUrl() });
  res.set('Cache-Control', CACHE_DE_PAGINA);
  return res.type('html').send(html);
});

export const postMarkdown = asyncHandler(async (req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const post = await prisma.blogPost.findFirst({
    where: { ...publicPostWhere(tenant.id), slug: String(req.params.slug) },
    select: postSelect
  });
  if (!post) return res.status(404).type('text/plain').send('Artigo não encontrado.');
  const siteUrl = process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br';
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.type('text/markdown; charset=utf-8').send(renderPostMarkdown(post, siteUrl));
});

export const listCategories = asyncHandler(async (_req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  res.json(await dadosDasCategorias(tenant.id));
});

export const sitemap = asyncHandler(async (_req: Request, res: Response) => {
  const tenant = await resolvePublicTenant();
  const posts = await prisma.blogPost.findMany({ where: publicPostWhere(tenant.id), select: { slug: true, updated_at: true } });
  const base = (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
  const staticLastModified = process.env.STATIC_CONTENT_LASTMOD || '2026-08-19';
  const urls = caminhosDasPaginasEstaticas.map((caminho) => `<url><loc>${escapeXml(base + caminho)}</loc><lastmod>${staticLastModified}</lastmod></url>`)
    .concat(posts.map((post) => `<url><loc>${escapeXml(`${base}/blog/${post.slug}`)}</loc><lastmod>${post.updated_at.toISOString()}</lastmod></url>`))
    // Lojas e produtos do mercado, quando houver loja aprovada.
    .concat(await urlsDoMercadoParaSitemap(tenant.id, base));
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`);
});

async function allPublicPosts() {
  const tenant = await resolvePublicTenant();
  return prisma.blogPost.findMany({
    where: publicPostWhere(tenant.id),
    select: postSelect,
    orderBy: [{ published_at: 'desc' }, { scheduled_for: 'desc' }]
  });
}

export const llmsIndex = asyncHandler(async (_req: Request, res: Response) => {
  const posts = await allPublicPosts();
  const base = (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
  const lines = [
    '# Saúde PET',
    '',
    '> Plataforma brasileira de atendimento veterinário domiciliar e conteúdo de saúde animal.',
    '',
    '## Páginas principais',
    '',
    `- [Início](${base}/): apresentação do serviço e solicitação de contato.`,
    `- [Perguntas frequentes](${base}/faq): funcionamento, atendimento, agendamento, pagamentos e privacidade.`,
    `- [Blog](${base}/blog): artigos públicos sobre saúde e bem-estar animal.`,
    `- [Contato](${base}/contato): canais oficiais para falar com o Saúde PET.`,
    `- [Política de Privacidade](${base}/privacidade): tratamento de dados e direitos dos titulares.`,
    '',
    '## Artigos publicados',
    '',
    ...posts.map((post) => `- [${post.title}](${base}/blog/${post.slug}.md): ${post.excerpt}`),
    '',
    '## Recursos estruturados',
    '',
    `- [Sitemap XML](${base}/sitemap.xml)`,
    `- [RSS](${base}/rss.xml)`,
    `- [Versão completa para modelos de linguagem](${base}/llms-full.txt)`
  ];
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.type('text/markdown; charset=utf-8').send(lines.join('\n'));
});

export const llmsFull = asyncHandler(async (_req: Request, res: Response) => {
  const posts = await allPublicPosts();
  const base = (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
  const header = [
    '# Saúde PET — conteúdo público completo',
    '',
    'Fonte oficial de informações institucionais e artigos públicos do Saúde PET.',
    `Site: ${base}`,
    `Sitemap: ${base}/sitemap.xml`,
    '',
    '---'
  ].join('\n');
  const body = posts.map((post) => renderPostMarkdown(post, base)).join('\n\n---\n\n');
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.type('text/markdown; charset=utf-8').send(`${header}\n\n${body}`);
});

export const rss = asyncHandler(async (_req: Request, res: Response) => {
  const posts = (await allPublicPosts()).slice(0, 50);
  const base = (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
  const items = posts.map((post) => {
    const url = `${base}/blog/${post.slug}`;
    const published = post.published_at || post.scheduled_for || post.updated_at;
    return `<item><title>${escapeXml(post.title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="true">${escapeXml(url)}</guid><description>${escapeXml(post.excerpt)}</description><pubDate>${new Date(published).toUTCString()}</pubDate>${post.category?.name ? `<category>${escapeXml(post.category.name)}</category>` : ''}${post.cover_image ? `<enclosure url="${escapeXml(absoluteUrl(base, post.cover_image))}" type="image/webp" />` : ''}</item>`;
  });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>Blog Saúde PET</title><link>${escapeXml(`${base}/blog`)}</link><description>Conteúdo sobre saúde, prevenção e bem-estar animal.</description><language>pt-BR</language><atom:link href="${escapeXml(`${base}/rss.xml`)}" rel="self" type="application/rss+xml" />${items.join('')}</channel></rss>`;
  res.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  return res.type('application/rss+xml; charset=utf-8').send(xml);
});

export const indexNowKey = (req: Request, res: Response) => {
  const configuredKey = process.env.INDEXNOW_KEY;
  if (!configuredKey || req.params.key !== configuredKey) return res.status(404).type('text/plain').send('Not found');
  return res.type('text/plain; charset=utf-8').send(configuredKey);
};
