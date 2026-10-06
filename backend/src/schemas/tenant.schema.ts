import { z } from 'zod';

// Schema para criar novo tenant
const createTenantSchema = z.object({
  nome: z.string().min(3, 'Nome deve ter pelo menos 3 caracteres').max(100),
  slug: z.string()
    .min(3, 'Slug deve ter pelo menos 3 caracteres')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug deve conter apenas letras minúsculas, números e hífens'),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve conter 14 dígitos').optional(),
  email: z.string().email('Email inválido'),
  telefone: z.string()
    .regex(/^\(\d{2}\)\s?\d{4,5}-?\d{4}$/, 'Formato de telefone inválido'),
  endereco: z.string().optional(),
  cidade: z.string().min(2),
  estado: z.string().length(2, 'Estado deve ter 2 caracteres (UF)'),
  logo: z.string().url().optional(),
  plano: z.enum(['free', 'basic', 'premium', 'enterprise']).default('free'),
  limite_usuarios: z.number().int().positive().default(10),
  limite_pets: z.number().int().positive().default(100)
});

// Schema para atualizar tenant
const updateTenantSchema = z.object({
  nome: z.string().min(3).max(100).optional(),
  email: z.string().email().optional(),
  telefone: z.string()
    .regex(/^\(\d{2}\)\s?\d{4,5}-?\d{4}$/)
    .optional(),
  endereco: z.string().optional(),
  cidade: z.string().min(2).optional(),
  estado: z.string().length(2).optional(),
  logo: z.string().url().optional()
});

// Schema para atualizar status do tenant (apenas super_admin)
const updateTenantStatusSchema = z.object({
  status: z.enum(['ativo', 'suspenso', 'trial', 'cancelado'])
});

// Schema para atualizar plano do tenant (apenas super_admin)
const updateTenantPlanSchema = z.object({
  plano: z.enum(['free', 'basic', 'premium', 'enterprise']),
  limite_usuarios: z.number().int().positive().optional(),
  limite_pets: z.number().int().positive().optional(),
  expira_em: z.string().datetime().optional()
});

// Schema para configurações do tenant
const updateTenantConfigSchema = z.object({
  permitir_cadastro: z.boolean().optional(),
  requer_aprovacao_vet: z.boolean().optional(),
  notificacoes_email: z.boolean().optional(),
  notificacoes_sms: z.boolean().optional(),
  cor_primaria: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato hexadecimal #RRGGBB').optional(),
  cor_secundaria: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor deve estar no formato hexadecimal #RRGGBB').optional(),
  comissao_plataforma_pct: z.number().min(0, 'Comissão não pode ser negativa').max(100, 'Comissão máxima é 100%').optional(),
  cidade_padrao: z.string().min(2).max(100).nullable().optional()
});

export {
  createTenantSchema,
  updateTenantSchema,
  updateTenantStatusSchema,
  updateTenantPlanSchema,
  updateTenantConfigSchema
};
