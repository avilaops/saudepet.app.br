import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const idText = z.string().trim().min(8).max(100);
const phoneRegex = /^(?:\+?55)?\d{10,11}$/;
const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const leadSchema = z.object({
  name: z.string().trim().min(3).max(120),
  phone: z.string().transform((value: string) => value.replace(/\D/g, '')).refine((value: string) => phoneRegex.test(value), 'Telefone brasileiro inválido'),
  email: z.string().trim().toLowerCase().email().max(160).optional().or(z.literal('')),
  city: optionalText(100),
  state: optionalText(2),
  petName: optionalText(100),
  petType: optionalText(40),
  // Era uma escolha entre quatro rótulos (máx. 160). Virou texto livre: a pessoa
  // descreve a dúvida com as próprias palavras. A coluna no Postgres é `text`,
  // então o limite maior não pede migration.
  interest: z.string().trim().min(2).max(2000),
  preferredContactTime: optionalText(80),
  privacyAccepted: z.boolean().refine(Boolean, 'É necessário aceitar a Política de Privacidade'),
  privacyPurpose: z.string().trim().min(10).max(300),
  sourcePage: optionalText(500),
  referrer: optionalText(1000),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  utmTerm: optionalText(160),
  anonymousSessionId: idText.optional(),
  website: z.string().max(0).optional().or(z.literal(''))
});

const pageViewSchema = z.object({
  anonymousVisitorId: idText,
  anonymousSessionId: idText,
  navigationId: idText,
  path: z.string().trim().startsWith('/').max(500),
  pageTitle: optionalText(200),
  referrer: optionalText(1000),
  utmSource: optionalText(120),
  utmMedium: optionalText(120),
  utmCampaign: optionalText(160),
  utmContent: optionalText(160),
  utmTerm: optionalText(160),
  articleSlug: optionalText(180)
});

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
  search: optionalText(120),
  category: optionalText(120),
  status: z.enum(['rascunho', 'agendado', 'publicado']).optional()
});

const leadQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: optionalText(120),
  status: z.enum(['novo', 'contatado', 'qualificado', 'convertido', 'perdido', 'arquivado']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  sort: z.enum(['created_desc', 'created_asc', 'name_asc']).default('created_desc')
});

const dashboardQuerySchema = z.object({
  range: z.enum(['today', '7d', '30d', 'custom']).default('30d'),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional()
}).refine((data) => data.range !== 'custom' || (data.from && data.to), {
  message: 'Período personalizado exige from e to'
});

const blogPostSchema = z.object({
  slug: z.string().trim().min(3).max(180).regex(slugRegex),
  title: z.string().trim().min(5).max(180),
  excerpt: z.string().trim().min(20).max(400),
  content: z.string().trim().min(40).max(120000).refine((value: string) => !/<\s*script\b/i.test(value), 'Scripts não são permitidos'),
  coverImage: optionalText(1000),
  coverImageAlt: optionalText(180),
  authorName: z.string().trim().min(2).max(100),
  categoryId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  status: z.enum(['rascunho', 'agendado', 'publicado']).default('rascunho'),
  seoTitle: optionalText(70),
  seoDescription: optionalText(170),
  socialImage: optionalText(1000),
  publishedAt: z.string().datetime().optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable()
}).refine((data) => data.status !== 'agendado' || data.scheduledFor, {
  message: 'Publicação agendada exige data', path: ['scheduledFor']
});

const categorySchema = z.object({
  slug: z.string().trim().min(2).max(100).regex(slugRegex),
  name: z.string().trim().min(2).max(100),
  description: optionalText(300)
});

const leadUpdateSchema = z.object({
  status: z.enum(['novo', 'contatado', 'qualificado', 'convertido', 'perdido', 'arquivado']).optional(),
  notes: optionalText(4000)
}).refine((data) => data.status !== undefined || data.notes !== undefined, 'Nenhuma alteração informada');

export {
  leadSchema,
  pageViewSchema,
  paginationQuerySchema,
  leadQuerySchema,
  dashboardQuerySchema,
  blogPostSchema,
  categorySchema,
  leadUpdateSchema
};
