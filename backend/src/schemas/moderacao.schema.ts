import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// SCHEMAS DE MODERAÇÃO E BANIMENTO
// ═══════════════════════════════════════════════════════

const tipoViolacaoEnum = z.enum([
  'spam',
  'abuso_verbal',
  'assedio',
  'conteudo_inapropriado',
  'fraude',
  'informacao_falsa',
  'violacao_termos',
  'other'
]);

const statusViolacaoEnum = z.enum([
  'pendente',
  'em_analise',
  'confirmada',
  'rejeitada',
  'resolvida'
]);

const tipoPunicaoEnum = z.enum([
  'advertencia',
  'suspensao_temp',
  'suspensao_perm',
  'restricao_funcao'
]);

// Schema para reportar violação
const reportarViolacaoSchema = z.object({
  usuario_id: z.string().uuid('ID de usuário inválido'),
  tipo: tipoViolacaoEnum,
  descricao: z.string().min(10, 'Descrição deve ter no mínimo 10 caracteres').max(1000),
  evidencias: z.array(z.object({
    tipo: z.enum(['link', 'screenshot', 'mensagem', 'outro']),
    conteudo: z.string()
  })).optional(),
  gravidade: z.number().int().min(1).max(5).default(1)
});

// Schema para analisar violação (admin)
const analisarViolacaoSchema = z.object({
  status: z.enum(['confirmada', 'rejeitada', 'resolvida']),
  resolucao: z.string().min(10, 'Explique a resolução').max(500)
});

// Schema para aplicar punição
const aplicarPunicaoSchema = z.object({
  usuario_id: z.string().uuid(),
  violacao_id: z.string().uuid(),
  tipo: tipoPunicaoEnum,
  motivo: z.string().min(10).max(500),
  dias_suspensao: z.number().int().min(1).max(365).optional() // Para suspensão temporária
});

// Schema para revogar punição
const revogarPunicaoSchema = z.object({
  motivo_revogacao: z.string().min(10, 'Explique o motivo da revogação').max(500)
});

// Schema para consultar violações
const consultarViolacoesSchema = z.object({
  usuario_id: z.string().uuid().optional(),
  tipo: tipoViolacaoEnum.optional(),
  status: statusViolacaoEnum.optional(),
  data_inicio: z.string().datetime().optional(),
  data_fim: z.string().datetime().optional(),
  gravidade_min: z.coerce.number().int().min(1).max(5).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

// Schema para consultar punições
const consultarPunicoesSchema = z.object({
  usuario_id: z.string().uuid().optional(),
  tipo: tipoPunicaoEnum.optional(),
  ativa: z.enum(['true', 'false']).transform(val => val === 'true').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export {
  reportarViolacaoSchema,
  analisarViolacaoSchema,
  aplicarPunicaoSchema,
  revogarPunicaoSchema,
  consultarViolacoesSchema,
  consultarPunicoesSchema
};
