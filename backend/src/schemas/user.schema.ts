import { z } from 'zod';

const telefoneRegex = /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/;

const createUserSchema = z.object({
  nome: z.string().min(3).max(100).trim(),
  email: z.string().email().toLowerCase().trim(),
  telefone: z.string().regex(telefoneRegex).trim(),
  senha: z.string().min(8).max(100),
  tipo_usuario: z.enum(['tutor', 'veterinario', 'admin', 'super_admin']),
  cidade: z.string().min(2).max(100).trim(),
  tenant_id: z.string().uuid().optional(),
  crmv: z.string().min(4).max(20).trim().optional(),
  especialidade: z.string().min(3).max(100).trim().optional()
}).superRefine((data, ctx) => {
  if (data.tipo_usuario === 'veterinario' && (!data.crmv || !data.especialidade)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['crmv'],
      message: 'CRMV e especialidade são obrigatórios para veterinários'
    });
  }
});

// Schema para atualização de perfil do usuário
const updateProfileSchema = z.object({
  nome: z.string()
    .min(3, 'Nome deve ter no mínimo 3 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim()
    .optional(),

  email: z.string()
    .email('Email inválido')
    .toLowerCase()
    .trim()
    .optional(),

  telefone: z.string()
    .regex(telefoneRegex, 'Telefone inválido. Use o formato (XX) XXXXX-XXXX')
    .trim()
    .optional(),

  cidade: z.string()
    .min(2, 'Cidade deve ter no mínimo 2 caracteres')
    .max(100, 'Cidade deve ter no máximo 100 caracteres')
    .trim()
    .optional(),

  data_nascimento: z.coerce.date({ message: 'Data de nascimento inválida' })
    .max(new Date(), 'Data de nascimento não pode estar no futuro')
    .optional()
    .nullable(),

  sobre: z.string()
    .max(500, 'Sobre deve ter no máximo 500 caracteres')
    .trim()
    .optional()
    .nullable(),

  foto_perfil: z.string()
    .url('URL da foto de perfil inválida')
    .optional()
    .nullable(),

  foto_capa: z.string()
    .url('URL da foto de capa inválida')
    .optional()
    .nullable()
});

// Schema para alteração de senha
const changePasswordSchema = z.object({
  senha_atual: z.string()
    .min(1, 'Senha atual é obrigatória'),

  senha_nova: z.string()
    .min(6, 'Nova senha deve ter no mínimo 6 caracteres')
    .max(100, 'Nova senha deve ter no máximo 100 caracteres')
});

export {
  createUserSchema,
  updateProfileSchema,
  changePasswordSchema
};
