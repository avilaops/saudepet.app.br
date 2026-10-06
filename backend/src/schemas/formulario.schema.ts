import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// SCHEMAS DE FORMULÁRIOS
// ═══════════════════════════════════════════════════════

const tipoFormularioEnum = z.enum([
  'pre_consulta',
  'anamnese',
  'pos_consulta',
  'cadastro_pet',
  'termo_consentimento',
  'custom'
]);

const statusFormularioEnum = z.enum(['ativo', 'inativo', 'arquivado']);

// Schema para criação de formulário
const createFormularioSchema = z.object({
  titulo: z.string().min(3, 'Título deve ter no mínimo 3 caracteres').max(200),
  descricao: z.string().max(500).optional(),
  tipo: tipoFormularioEnum,
  obrigatorio: z.boolean().default(false),
  campos: z.array(z.object({
    id: z.string(),
    tipo: z.enum(['texto', 'textarea', 'numero', 'data', 'select', 'checkbox', 'radio', 'arquivo']),
    label: z.string(),
    placeholder: z.string().optional(),
    obrigatorio: z.boolean().default(false),
    opcoes: z.array(z.string()).optional(), // Para select, checkbox, radio
    validacao: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      regex: z.string().optional(),
      mensagem_erro: z.string().optional()
    }).optional()
  })).min(1, 'Formulário deve ter pelo menos 1 campo')
});

// Schema para atualização de formulário
const updateFormularioSchema = z.object({
  titulo: z.string().min(3).max(200).optional(),
  descricao: z.string().max(500).optional(),
  status: statusFormularioEnum.optional(),
  obrigatorio: z.boolean().optional(),
  campos: z.array(z.object({
    id: z.string(),
    tipo: z.enum(['texto', 'textarea', 'numero', 'data', 'select', 'checkbox', 'radio', 'arquivo']),
    label: z.string(),
    placeholder: z.string().optional(),
    obrigatorio: z.boolean().default(false),
    opcoes: z.array(z.string()).optional(),
    validacao: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      regex: z.string().optional(),
      mensagem_erro: z.string().optional()
    }).optional()
  })).optional()
});

// Schema para responder formulário
const responderFormularioSchema = z.object({
  formulario_id: z.string().uuid('ID de formulário inválido'),
  atendimento_id: z.string().uuid().optional(),
  pet_id: z.string().uuid().optional(),
  // No Zod 4 o `record` exige o tipo da CHAVE além do valor. A forma antiga
  // compilava em JavaScript e validava menos do que parecia.
  respostas: z.record(z.string(), z.any()) // { campo_id: valor }
});

// Schema para buscar formulários
const buscarFormulariosSchema = z.object({
  tipo: tipoFormularioEnum.optional(),
  status: statusFormularioEnum.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

export {
  createFormularioSchema,
  updateFormularioSchema,
  responderFormularioSchema,
  buscarFormulariosSchema
};
