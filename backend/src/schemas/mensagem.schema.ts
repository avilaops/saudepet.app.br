import { z } from 'zod';

// Tipos de mensagem aceitos. `video` entrou junto com o anexo de vídeo curto do
// chat (ver `upload.middleware.js`): 25MB, sem transcodificação, guardado como
// veio e sujeito à mesma retenção dos demais anexos.
//
// A coluna `tipo` é `String` no Prisma, não enum, então esta lista é o único
// lugar que precisa saber dos tipos válidos — não há migration a fazer.
const TIPOS_MENSAGEM = ['texto', 'imagem', 'documento', 'localizacao', 'video'];

// Schema para envio de mensagem
const enviarMensagemSchema = z.object({
  destinatarioId: z.string()
    .uuid('ID do destinatário inválido')
    .optional(),

  // Mensagem com anexo ou localização pode vir sem texto — a legenda é opcional.
  conteudo: z.string()
    .max(2000, 'Mensagem deve ter no máximo 2000 caracteres')
    .trim()
    .optional(),

  tipo: z.enum(TIPOS_MENSAGEM, {
    error: `Tipo de mensagem deve ser um de: ${TIPOS_MENSAGEM.join(', ')}`
  }).default('texto'),

  atendimentoId: z.string()
    .uuid('ID do atendimento inválido')
    .optional()
    .nullable(),

  solicitacao_id: z.string()
    .uuid('ID da solicitação inválido')
    .optional()
    .nullable(),

  // Ponto único compartilhado pelo usuário, não rastreamento contínuo.
  // `coerce` porque um envio com anexo é multipart e chega como texto.
  latitude: z.coerce.number()
    .min(-90, 'Latitude inválida')
    .max(90, 'Latitude inválida')
    .optional()
    .nullable(),

  longitude: z.coerce.number()
    .min(-180, 'Longitude inválida')
    .max(180, 'Longitude inválida')
    .optional()
    .nullable(),

  endereco: z.string()
    .max(300, 'Endereço deve ter no máximo 300 caracteres')
    .trim()
    .optional()
    .nullable()
}).refine(
  // Ou a mensagem pertence a um atendimento, ou é uma conversa direta com alguém
  // com quem já existe vínculo profissional (validado no controller).
  (data) => data.solicitacao_id || data.atendimentoId || data.destinatarioId,
  { message: 'Informe o atendimento ou o destinatário da mensagem' }
).superRefine((data, ctx) => {
  if (data.tipo === 'localizacao') {
    if (data.latitude === undefined || data.latitude === null || data.longitude === undefined || data.longitude === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['latitude'],
        message: 'Mensagem de localização exige latitude e longitude'
      });
    }
    return;
  }

  // Texto sem conteúdo e sem anexo seria uma mensagem vazia. O controller
  // confirma o anexo depois do upload; aqui garantimos o caso puro de texto.
  if (data.tipo === 'texto' && !data.conteudo) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['conteudo'],
      message: 'Mensagem não pode ser vazia'
    });
  }
});

// Edição preserva o conteúdo anterior em `mensagens_edicoes`; aqui só validamos o novo.
const editarMensagemSchema = z.object({
  conteudo: z.string()
    .min(1, 'Mensagem não pode ser vazia')
    .max(2000, 'Mensagem deve ter no máximo 2000 caracteres')
    .trim()
});

// Schema para marcar mensagem como lida
const marcarLidaSchema = z.object({
  mensagemId: z.string()
    .uuid('ID da mensagem inválido')
});

export {
  enviarMensagemSchema,
  editarMensagemSchema,
  marcarLidaSchema,
  TIPOS_MENSAGEM
};
