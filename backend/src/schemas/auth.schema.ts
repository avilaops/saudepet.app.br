import { z } from 'zod';

// Regex para telefone brasileiro: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
const telefoneRegex = /^\(\d{2}\)\s?\d{4,5}-?\d{4}$/;

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Schema para registro de usuário.
// Sem defaults inventados: até 20/08/2026 este schema completava o cadastro
// com senha 'saudepet123', nome 'Tutor Saúde PET', telefone e CRMV falsos —
// toda conta criada só com o e-mail nascia com a mesma senha conhecida.
const registerSchema = z.object({
  nome: z.string()
    .min(2, 'Nome deve ter no mínimo 2 caracteres')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .trim(),

  email: z.string()
    .email('Email inválido')
    .toLowerCase()
    .trim(),

  telefone: z.string()
    .regex(telefoneRegex, 'Telefone inválido — use o formato (XX) XXXXX-XXXX')
    .optional(),

  senha: z.string()
    .min(6, 'Senha deve ter no mínimo 6 caracteres')
    .max(72, 'Senha deve ter no máximo 72 caracteres'),

  tipo_usuario: z.enum(['tutor', 'veterinario'], {
    error: 'Cadastro público permitido apenas para tutor ou veterinario'
  }).default('tutor'),

  cidade: z.string()
    .max(100, 'Cidade deve ter no máximo 100 caracteres')
    .trim()
    .optional(),

  tenant_slug: z.string()
    .optional()
    .default('saudepet'),

  crmv: z.string()
    .max(20, 'CRMV deve ter no máximo 20 caracteres')
    .trim()
    .optional(),

  // UF do conselho emissor. O número do CRMV repete entre estados; só o par
  // (número, UF) identifica o profissional na conferência do admin.
  crmv_uf: z.string()
    .trim()
    .toUpperCase()
    .optional()
    .refine((uf: string | undefined) => uf === undefined || UFS.includes(uf), { message: 'Estado do CRMV inválido' }),

  especialidade: z.string()
    .max(100, 'Especialidade deve ter no máximo 100 caracteres')
    .trim()
    .optional()
}).superRefine((dados: any, ctx: any) => {
  if (dados.tipo_usuario !== 'veterinario') return;
  if (!dados.crmv) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['crmv'], message: 'CRMV é obrigatório para cadastro de veterinário' });
  }
  if (!dados.crmv_uf) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['crmv_uf'], message: 'Estado do CRMV é obrigatório para cadastro de veterinário' });
  }
  if (!dados.especialidade) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['especialidade'], message: 'Especialidade é obrigatória para cadastro de veterinário' });
  }
  if (!dados.telefone) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['telefone'], message: 'Telefone é obrigatório para cadastro de veterinário' });
  }
});

// Schema para login
const loginSchema = z.object({
  email: z.string()
    .email('Email inválido')
    .toLowerCase()
    .trim(),

  senha: z.string()
    .min(1, 'Senha é obrigatória'),

  tenant_slug: z.string()
    .optional()
});

export {
  UFS,
  registerSchema,
  loginSchema
};
