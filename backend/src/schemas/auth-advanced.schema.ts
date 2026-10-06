import { z } from 'zod';

// Schema para solicitar reset de senha
const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  tenant_slug: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional()
});

// Schema para resetar senha
const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório'),
  senha: z.string()
    .min(6, 'Senha deve ter no mínimo 6 caracteres')
    .max(100, 'Senha deve ter no máximo 100 caracteres')
});

// Schema para alterar senha (usuário autenticado)
const changePasswordSchema = z.object({
  senha_atual: z.string().min(1, 'Senha atual é obrigatória'),
  senha_nova: z.string()
    .min(6, 'Senha nova deve ter no mínimo 6 caracteres')
    .max(100, 'Senha nova deve ter no máximo 100 caracteres')
}).refine(
  (data) => data.senha_atual !== data.senha_nova,
  {
    message: 'Senha nova deve ser diferente da senha atual',
    path: ['senha_nova']
  }
);

// Schema para refresh token
const refreshTokenSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token é obrigatório')
});

// Schema para verificar email
const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Token é obrigatório')
});

// Schema para reenviar verificação de email
const resendVerificationSchema = z.object({
  email: z.string().email('Email inválido').toLowerCase().trim(),
  tenant_slug: z.string()
    .min(3)
    .max(50)
    .regex(/^[a-z0-9-]+$/)
    .optional()
});

export {
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  resendVerificationSchema
};
