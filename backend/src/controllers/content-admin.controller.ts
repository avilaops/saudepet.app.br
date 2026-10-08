import { inicioDoDiaBr } from '../utils/datas';
import type { Request, Response } from 'express';
import type { Prisma } from '@prisma/client';
import type { z } from 'zod';
import crypto from 'crypto';
import prisma from '../config/database';
import { asyncHandler, NotFoundError, ConflictError, ValidationError } from '../middleware/error.middleware';
import { resolveAdminTenant } from '../services/public-tenant.service';
import AuditService from '../services/audit.service';
import * as indexNowService from '../services/indexnow.service';
import * as threadsService from '../services/threads.service';
import { uploadBuffer } from '../config/r2';
import type {
  blogPostSchema,
  categorySchema,
  dashboardQuerySchema,
  leadQuerySchema,
  leadUpdateSchema,
  paginationQuerySchema
} from '../schemas/content.schema';
import type { UsuarioAutenticado } from '../types/express';

type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
type LeadQuery = z.infer<typeof leadQuerySchema>;
type LeadUpdate = z.infer<typeof leadUpdateSchema>;
type PaginationQuery = z.infer<typeof paginationQuerySchema>;
type BlogPostInput = z.infer<typeof blogPostSchema>;
type CategoryInput = z.infer<typeof categorySchema>;

/**
 * `validate(schema, 'query')` substitui `req.query` pelo objeto já validado e
 * coagido (números, defaults). O tipo do Express não sabe disso, então cada
 * handler declara o schema pelo qual a rota passou.
 */
const queryValidada = <T>(req: Request): T => req.query as unknown as T;
const corpoValidado = <T>(req: Request): T => req.body as T;

/** O admin autenticado. Sem `authMiddleware` na frente a rota não faz sentido. */
function usuarioDaRequisicao(req: Request): UsuarioAutenticado {
  if (!req.user) throw new Error('Usuário não autenticado');
  return req.user;
}

/** `error.code` de um erro qualquer (P2002 do Prisma), sem supor que é Error. */
function codigoDoErro(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : undefined;
}

function periodFromQuery(query: DashboardQuery) {
  const now = query.to ? new Date(query.to) : new Date();
  let from: Date;
  if (query.range === 'custom') from = new Date(String(query.from));
  else if (query.range === 'today') from = inicioDoDiaBr(now);
  else from = new Date(now.getTime() - (query.range === '7d' ? 7 : 30) * 86400000);
  if (from >= now) throw new ValidationError('Período inválido');
  const previousFrom = new Date(from.getTime() - (now.getTime() - from.getTime()));
  return { from, to: now, previousFrom, previousTo: from };
}

function percentChange(current: number, previous: number): number {
  if (!previous) return current ? 100 : 0;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function dailySeries(rows: { occurred_at: Date }[], from: Date, to: Date) {
  const days = new Map<string, number>();
  for (let cursor = new Date(from); cursor <= to; cursor.setDate(cursor.getDate() + 1)) {
    days.set(cursor.toISOString().slice(0, 10), 0);
  }
  rows.forEach(({ occurred_at }) => {
    const key = occurred_at.toISOString().slice(0, 10);
    if (days.has(key)) days.set(key, (days.get(key) ?? 0) + 1);
  });
  return [...days].map(([date, views]) => ({ date, views }));
}

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const { from, to, previousFrom, previousTo } = periodFromQuery(queryValidada<DashboardQuery>(req));
  const currentDate = { gte: from, lte: to };
  const previousDate = { gte: previousFrom, lt: previousTo };
  const base = { tenant_id: tenantId };
  const [views, sessions, visitors, leads, converted, previousViews, previousLeads, timestamps, topPages, sources, campaigns, devices, articles] = await Promise.all([
    prisma.pageView.count({ where: { ...base, occurred_at: currentDate } }),
    prisma.visitSession.count({ where: { ...base, started_at: currentDate } }),
    prisma.visitSession.findMany({ where: { ...base, started_at: currentDate }, distinct: ['anonymous_visitor_id'], select: { anonymous_visitor_id: true } }),
    prisma.lead.count({ where: { ...base, created_at: currentDate } }),
    prisma.lead.count({ where: { ...base, created_at: currentDate, status: 'convertido' } }),
    prisma.pageView.count({ where: { ...base, occurred_at: previousDate } }),
    prisma.lead.count({ where: { ...base, created_at: previousDate } }),
    prisma.pageView.findMany({ where: { ...base, occurred_at: currentDate }, select: { occurred_at: true } }),
    prisma.pageView.groupBy({ by: ['path'], where: { ...base, occurred_at: currentDate }, _count: { _all: true, path: true }, orderBy: { _count: { path: 'desc' } }, take: 10 }),
    prisma.visitSession.groupBy({ by: ['utm_source'], where: { ...base, started_at: currentDate }, _count: { _all: true, utm_source: true }, orderBy: { _count: { utm_source: 'desc' } }, take: 10 }),
    prisma.lead.groupBy({ by: ['utm_campaign'], where: { ...base, created_at: currentDate }, _count: { _all: true, utm_campaign: true }, orderBy: { _count: { utm_campaign: 'desc' } }, take: 10 }),
    prisma.pageView.groupBy({ by: ['device_category'], where: { ...base, occurred_at: currentDate }, _count: { _all: true, device_category: true }, orderBy: { _count: { device_category: 'desc' } } }),
    prisma.pageView.groupBy({ by: ['article_slug'], where: { ...base, occurred_at: currentDate, article_slug: { not: null } }, _count: { _all: true, article_slug: true }, orderBy: { _count: { article_slug: 'desc' } }, take: 10 })
  ]);
  // Funil de conversão de ponta a ponta: sessão → lead → cadastro → solicitação → finalizado.
  const [novosTutores, solicitacoesCriadas, solicitacoesFinalizadas] = await Promise.all([
    prisma.usuario.count({ where: { tenant_id: tenantId, tipo_usuario: 'tutor', criado_em: currentDate } }),
    prisma.solicitacao.count({ where: { tenant_id: tenantId, criado_em: currentDate } }),
    prisma.solicitacao.count({ where: { tenant_id: tenantId, criado_em: currentDate, status: { in: ['finalizado', 'concluido'] } } })
  ]);

  res.json({
    period: { from, to },
    funnel: [
      { etapa: 'Sessões no site', valor: sessions },
      { etapa: 'Leads captados', valor: leads },
      { etapa: 'Cadastros de tutor', valor: novosTutores },
      { etapa: 'Solicitações de atendimento', valor: solicitacoesCriadas },
      { etapa: 'Atendimentos finalizados', valor: solicitacoesFinalizadas }
    ],
    totals: { pageViews: views, sessions, approximateVisitors: visitors.length, leads, convertedLeads: converted, conversionRate: sessions ? Math.round((leads / sessions) * 10000) / 100 : 0 },
    comparison: { pageViews: percentChange(views, previousViews), leads: percentChange(leads, previousLeads) },
    daily: dailySeries(timestamps, from, to),
    topPages: topPages.map((item) => ({ path: item.path, views: item._count._all })),
    sources: sources.map((item) => ({ source: item.utm_source || 'direto', sessions: item._count._all })),
    campaigns: campaigns.map((item) => ({ campaign: item.utm_campaign || 'sem campanha', leads: item._count._all })),
    devices: devices.map((item) => ({ device: item.device_category || 'não identificado', views: item._count._all })),
    articles: articles.map((item) => ({ slug: item.article_slug, views: item._count._all }))
  });
});

function leadWhere(tenantId: string, query: LeadQuery): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { tenant_id: tenantId };
  if (query.status) where.status = query.status;
  if (query.search) where.OR = [
    { name: { contains: query.search, mode: 'insensitive' } },
    { email: { contains: query.search, mode: 'insensitive' } },
    { phone: { contains: query.search } },
    { city: { contains: query.search, mode: 'insensitive' } }
  ];
  if (query.from || query.to) where.created_at = { ...(query.from ? { gte: new Date(query.from) } : {}), ...(query.to ? { lte: new Date(query.to) } : {}) };
  return where;
}

const leadOrder = (sort: LeadQuery['sort']): Prisma.LeadOrderByWithRelationInput =>
  sort === 'created_asc' ? { created_at: 'asc' } : sort === 'name_asc' ? { name: 'asc' } : { created_at: 'desc' };

export const listLeads = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const query = queryValidada<LeadQuery>(req);
  const where = leadWhere(tenantId, query);
  const [leads, total] = await Promise.all([
    prisma.lead.findMany({ where, orderBy: leadOrder(query.sort), skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.lead.count({ where })
  ]);
  res.json({ leads, pagination: { ...query, total, pages: Math.ceil(total / query.limit) } });
});

export const getLead = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const lead = await prisma.lead.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId } });
  if (!lead) throw new NotFoundError('Lead não encontrado');
  res.json({ lead });
});

export const updateLead = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  const corpo = corpoValidado<LeadUpdate>(req);
  const existing = await prisma.lead.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId }, select: { id: true } });
  if (!existing) throw new NotFoundError('Lead não encontrado');
  const data: Prisma.LeadUpdateInput = {};
  if (corpo.status !== undefined) {
    data.status = corpo.status;
    data.archived_at = corpo.status === 'arquivado' ? new Date() : null;
  }
  if (corpo.notes !== undefined) data.notes = corpo.notes || null;
  const lead = await prisma.lead.update({ where: { id: existing.id }, data });
  await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'lead_update', recurso: 'lead', recursoId: lead.id, detalhes: { status: data.status } });
  res.json({ lead });
});

export const deleteLead = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  const existing = await prisma.lead.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId }, select: { id: true } });
  if (!existing) throw new NotFoundError('Lead não encontrado');
  await prisma.lead.delete({ where: { id: existing.id } });
  await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'lead_delete', recurso: 'lead', recursoId: existing.id });
  res.status(204).end();
});

function csvCell(value: unknown): string { return `"${String(value ?? '').replace(/"/g, '""')}"`; }
export const exportLeads = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const query = queryValidada<LeadQuery>(req);
  const leads = await prisma.lead.findMany({ where: leadWhere(tenantId, query), orderBy: leadOrder(query.sort), take: 10000 });
  const header = ['nome', 'telefone', 'email', 'cidade', 'estado', 'interesse', 'origem', 'campanha', 'status', 'criado_em'];
  const rows = leads.map((lead) => [lead.name, lead.phone, lead.email, lead.city, lead.state, lead.interest, lead.source_page, lead.utm_campaign, lead.status, lead.created_at.toISOString()]);
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` });
  res.send(`﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\n')}`);
});

function blogData(body: BlogPostInput, userId: string) {
  return {
    slug: body.slug, title: body.title, excerpt: body.excerpt, content: body.content, content_format: 'markdown',
    cover_image: body.coverImage || null, cover_image_alt: body.coverImageAlt || null,
    author_name: body.authorName, author_id: userId, category_id: body.categoryId || null,
    tags: [...new Set(body.tags.map((tag) => tag.toLowerCase()))], status: body.status,
    seo_title: body.seoTitle || null, seo_description: body.seoDescription || null,
    social_image: body.socialImage || null,
    published_at: body.status === 'publicado' ? (body.publishedAt ? new Date(body.publishedAt) : new Date()) : null,
    // O schema garante `scheduledFor` quando o status é 'agendado'.
    scheduled_for: body.status === 'agendado' ? new Date(String(body.scheduledFor)) : null
  };
}

function blogUrl(slug: string): string {
  const base = (process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '');
  return `${base}/blog/${slug}`;
}

type PostParaVisibilidade = {
  status: string;
  published_at: Date | string | null;
  scheduled_for: Date | string | null;
};

function isPublicPost(post: PostParaVisibilidade, now = new Date()): boolean {
  if (post.status === 'publicado') return Boolean(post.published_at && new Date(post.published_at) <= now);
  return post.status === 'agendado' && Boolean(post.scheduled_for && new Date(post.scheduled_for) <= now);
}

function notifyPostChange(urls: string[], event: string): void {
  indexNowService.notifyUrls([...urls, `${(process.env.PUBLIC_SITE_URL || 'https://saudepet.app.br').replace(/\/$/, '')}/blog`], event).catch(() => {});
}

export const listPosts = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const query = queryValidada<PaginationQuery>(req);
  const where: Prisma.BlogPostWhereInput = { tenant_id: tenantId };
  if (query.status) where.status = query.status;
  if (query.search) where.OR = [{ title: { contains: query.search, mode: 'insensitive' } }, { slug: { contains: query.search, mode: 'insensitive' } }];
  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({ where, include: { category: true }, orderBy: { updated_at: 'desc' }, skip: (query.page - 1) * query.limit, take: query.limit }),
    prisma.blogPost.count({ where })
  ]);
  res.json({ posts, pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) } });
});

export const getPost = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const post = await prisma.blogPost.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId }, include: { category: true } });
  if (!post) throw new NotFoundError('Artigo não encontrado');
  res.json({ post });
});

export const createPost = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  try {
    const post = await prisma.blogPost.create({ data: { tenant_id: tenantId, ...blogData(corpoValidado<BlogPostInput>(req), usuario.id) }, include: { category: true } });
    await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'blog_create', recurso: 'blog_post', recursoId: post.id, detalhes: { status: post.status } });
    if (isPublicPost(post)) notifyPostChange([blogUrl(post.slug)], 'blog_post_published');
    res.status(201).json({ post });
  } catch (error) {
    if (codigoDoErro(error) === 'P2002') throw new ConflictError('Este slug já está em uso');
    throw error;
  }
});

export const updatePost = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  const existing = await prisma.blogPost.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantId },
    select: { id: true, slug: true, status: true, published_at: true, scheduled_for: true }
  });
  if (!existing) throw new NotFoundError('Artigo não encontrado');
  try {
    const post = await prisma.blogPost.update({ where: { id: existing.id }, data: blogData(corpoValidado<BlogPostInput>(req), usuario.id), include: { category: true } });
    await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'blog_update', recurso: 'blog_post', recursoId: post.id, detalhes: { status: post.status } });
    if (isPublicPost(existing) || isPublicPost(post)) {
      notifyPostChange([blogUrl(existing.slug), blogUrl(post.slug)], isPublicPost(post) ? 'blog_post_updated' : 'blog_post_unpublished');
    }
    res.json({ post });
  } catch (error) {
    if (codigoDoErro(error) === 'P2002') throw new ConflictError('Este slug já está em uso');
    throw error;
  }
});

export const publishPostToThreads = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  const post = await prisma.blogPost.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId } });
  if (!post) throw new NotFoundError('Artigo não encontrado');
  if (post.status !== 'publicado') throw new ConflictError('Só é possível publicar no Threads um artigo já publicado no blog');

  if (!threadsService.isConfigured()) {
    return res.status(503).json({ error: 'Integração com Threads ainda não configurada' });
  }

  const url = `${process.env.PUBLIC_SITE_URL || ''}/blog/${post.slug}`;
  const text = `${post.title}\n\n${post.excerpt}\n\n${url}`.slice(0, 500);
  const result = await threadsService.publishText(text);

  await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'blog_publish_threads', recurso: 'blog_post', recursoId: post.id, detalhes: { threads_post_id: result.id } });
  res.json({ success: true, threads_post_id: result.id });
});

export const deletePost = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const usuario = usuarioDaRequisicao(req);
  const post = await prisma.blogPost.findFirst({
    where: { id: String(req.params.id), tenant_id: tenantId },
    select: { id: true, slug: true, status: true, published_at: true, scheduled_for: true }
  });
  if (!post) throw new NotFoundError('Artigo não encontrado');
  await prisma.blogPost.delete({ where: { id: post.id } });
  await AuditService.log({ tenantId, usuarioId: usuario.id, acao: 'blog_delete', recurso: 'blog_post', recursoId: post.id });
  if (isPublicPost(post)) notifyPostChange([blogUrl(post.slug)], 'blog_post_deleted');
  res.status(204).end();
});

/**
 * Upload da imagem de capa do artigo
 * POST /api/v1/admin/content/blog/imagem
 *
 * O editor pedia a capa como URL de texto: o admin precisava hospedar a imagem
 * por fora e colar o link — num produto que já tem pipeline de upload para o R2
 * (fotos de perfil, banners, anexos do chat). Na prática, ou o artigo saía sem
 * capa ou a imagem vivia num serviço de terceiros que ninguém controla.
 */
export const uploadBlogImage = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new ValidationError('Nenhuma imagem enviada');
  }

  const extensao = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase().slice(0, 8);
  const chave = `blog/${req.tenantId}/${crypto.randomUUID()}.${extensao}`;
  const url = await uploadBuffer(req.file.buffer, chave, req.file.mimetype);

  return res.status(201).json({ url, nome: req.file.originalname });
});

export const listCategories = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const categories = await prisma.blogCategory.findMany({ where: { tenant_id: tenantId }, include: { _count: { select: { posts: true } } }, orderBy: { name: 'asc' } });
  res.json({ categories });
});

export const createCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const corpo = corpoValidado<CategoryInput>(req);
  try {
    const category = await prisma.blogCategory.create({ data: { tenant_id: tenantId, slug: corpo.slug, name: corpo.name, description: corpo.description || null } });
    res.status(201).json({ category });
  } catch (error) {
    if (codigoDoErro(error) === 'P2002') throw new ConflictError('Esta categoria já existe');
    throw error;
  }
});

export const deleteCategory = asyncHandler(async (req: Request, res: Response) => {
  const tenantId = await resolveAdminTenant(req);
  const category = await prisma.blogCategory.findFirst({ where: { id: String(req.params.id), tenant_id: tenantId }, include: { _count: { select: { posts: true } } } });
  if (!category) throw new NotFoundError('Categoria não encontrada');
  if (category._count.posts) throw new ConflictError('Mova os artigos antes de excluir a categoria');
  await prisma.blogCategory.delete({ where: { id: category.id } });
  res.status(204).end();
});
