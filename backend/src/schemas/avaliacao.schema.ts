import { z } from 'zod';

// Schema para criação de avaliação
const createAvaliacaoSchema = z.object({
  atendimento_id: z.string()
    .uuid('ID do atendimento inválido')
    .optional(),

  solicitacao_id: z.string()
    .uuid('ID da solicitação inválido')
    .optional(),

  nota: z.number()
    .int('Nota deve ser um número inteiro')
    .min(1, 'Nota mínima é 1')
    .max(5, 'Nota máxima é 5'),

  comentario: z.string()
    .max(1000, 'Comentário deve ter no máximo 1000 caracteres')
    .trim()
    .optional()
    .nullable()
}).refine(
  data => data.atendimento_id || data.solicitacao_id,
  {
    message: 'Informe atendimento_id ou solicitacao_id',
    path: ['atendimento_id']
  }
);

export {
  createAvaliacaoSchema
};
