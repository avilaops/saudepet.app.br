import { z } from 'zod';

// Schema para criação de solicitação de atendimento
const createSolicitacaoSchema = z.object({
  pet_id: z.string()
    .uuid('ID do pet inválido'),

  // Escolha do profissional, quando o tipo permite. O serviço confere se o
  // veterinário existe, está aprovado e pode receber — aqui só a forma.
  veterinario_escolhido: z.string().uuid('Profissional inválido').optional().nullable(),

  tipo_atendimento: z.enum(
    ['emergencia', 'consulta_domiciliar', 'teleorientacao', 'vacinacao', 'avaliacao', 'consulta_rotina'],
    { error: 'Tipo de atendimento inválido.' }
  ),

  // Endereço e coordenada deixaram de ser opcionais.
  //
  // O despacho manda o chamado para quem está PERTO, com índice espacial e raio
  // da cidade. Sem coordenada ele não tem de onde medir e cai no modo antigo —
  // avisa todo mundo de plantão, sem distância, e o veterinário do outro lado da
  // cidade aparece na frente de quem está na esquina. Como o GPS entrava em
  // silêncio no fundo da tela, bastava a pessoa negar a permissão (ou o
  // navegador demorar) para o chamado nascer cego, sem ninguém perceber.
  localizacao_cliente: z.string()
    .min(5, 'Informe o endereço do atendimento')
    .max(500, 'Localização deve ter no máximo 500 caracteres')
    .trim(),

  // Endereço salvo usado neste chamado, quando houver: serve para ordenar a
  // lista do tutor pelo que ele realmente usa.
  endereco_id: z.string().uuid().optional().nullable(),

  latitude: z.number({ error: 'Confirme o local no mapa para o veterinário te encontrar' })
    .min(-90, 'Latitude inválida')
    .max(90, 'Latitude inválida'),

  longitude: z.number({ error: 'Confirme o local no mapa para o veterinário te encontrar' })
    .min(-180, 'Longitude inválida')
    .max(180, 'Longitude inválida'),

  // Sintomas descritos pelo tutor na abertura do chamado. O app sempre enviou este
  // campo, mas ele não existia aqui — como o Zod descarta chave desconhecida, a
  // descrição do problema era jogada fora antes de chegar ao controller e o
  // veterinário aceitava o chamado sem saber o motivo dele.
  observacoes: z.string()
    .max(2000, 'A descrição dos sintomas deve ter no máximo 2000 caracteres')
    .trim()
    .optional()
    .nullable()
});

// Status de encerramento do atendimento. Não podem ser alcançados por esta rota:
// fechar um atendimento é o que produz o prontuário, a receita e os PDFs enviados
// ao tutor, e isso só acontece em `PUT /:id/finalizar`. Antes dava para encerrar
// por aqui, e o atendimento terminava sem nenhum documento clínico.
const STATUS_DE_ENCERRAMENTO = ['finalizado', 'concluido'];

// Schema para atualização de status da solicitação
const updateStatusSchema = z.object({
  status: z.enum([
    'procurando_veterinario',
    'veterinario_encontrado',
    'a_caminho',
    'chegou',
    'atendimento_em_andamento',
    'finalizado',
    'concluido',
    'cancelado'
  ], {
    error: 'Status inválido'
  })
}).superRefine((data, ctx) => {
  if (STATUS_DE_ENCERRAMENTO.includes(data.status)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['status'],
      message: 'Para encerrar o atendimento use PUT /solicitacoes/:id/finalizar, registrando o prontuário.'
    });
  }
});

// Corrigir a receita de um atendimento fechado é uma RETIFICAÇÃO: reemite o
// documento e o tutor é avisado. Por isso o motivo é obrigatório — ele sai
// impresso no PDF novo, explicando por que a via anterior não vale mais.
const itemPrescricaoRetificada = z.object({
  medicamento: z.string().trim().min(1, 'Informe o medicamento').max(120),
  concentracao: z.string().trim().max(60).optional().nullable(),
  forma_farmaceutica: z.string().trim().max(60).optional().nullable(),
  posologia: z.string().trim().min(1, 'Informe a posologia').max(500),
  duracao_dias: z.coerce.number().int().min(1).max(365).optional().nullable()
});

const updatePrescriptionSchema = z.object({
  receita: z.string().trim().min(3, 'A prescrição deve ter pelo menos 3 caracteres').max(5000, 'A prescrição deve ter no máximo 5000 caracteres').optional(),
  prescricoes: z.array(itemPrescricaoRetificada).max(30, 'No máximo 30 medicamentos por receita').optional(),
  motivo: z.string().trim().min(10, 'Descreva o motivo da retificação com pelo menos 10 caracteres').max(500)
}).refine((dados) => dados.receita !== undefined || dados.prescricoes !== undefined, {
  message: 'Envie a receita corrigida (texto ou itens).',
  path: ['receita']
});

// Schema para aceitar solicitação (veterinário)
const aceitarSolicitacaoSchema = z.object({
  latitude: z.number()
    .min(-90, 'Latitude inválida')
    .max(90, 'Latitude inválida')
    .optional()
    .nullable(),

  longitude: z.number()
    .min(-180, 'Longitude inválida')
    .max(180, 'Longitude inválida')
    .optional()
    .nullable()
});

export {
  createSolicitacaoSchema,
  updateStatusSchema,
  updatePrescriptionSchema,
  aceitarSolicitacaoSchema,
  STATUS_DE_ENCERRAMENTO
};
