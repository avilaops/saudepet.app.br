import { z } from 'zod';

/**
 * Correção e remoção de registros da ficha clínica do pet.
 *
 * Alergia, vacina e medicação nasciam apenas no fechamento do atendimento e
 * ficavam imutáveis: errar o pet, a dose ou a data significava abrir o banco na
 * mão. Estes schemas são a porta de entrada da correção — e da remoção, que é
 * lógica, nunca `DELETE`.
 *
 * Duas regras atravessam todos eles:
 *  - a remoção exige motivo com pelo menos 5 caracteres, porque a linha continua
 *    no banco e alguém vai ler depois para entender por que sumiu da ficha;
 *  - a correção exige pelo menos um campo, para não gerar evento de auditoria
 *    de um PUT que não mudou nada.
 */

// Diferente do `textoOpcional` do prontuário, aqui campo ausente precisa
// continuar ausente: é assim que se distingue "não mexi neste campo" de
// "apaguei o conteúdo deste campo" num PUT parcial — e é o que sustenta a
// exigência de pelo menos um campo por correção.
const textoOpcional = (max: number, campo: string) => z.string()
  .trim()
  .max(max, `${campo} deve ter no máximo ${max} caracteres`)
  .nullable()
  .optional()
  .transform((valor) => (valor === undefined ? undefined : (valor || null)));

const dataOpcional = (campo: string) => z.coerce.date({ error: `${campo} inválida` })
  .nullable()
  .optional();

const exigeAlgumCampo = (dados: any, ctx: any) => {
  const informados = Object.values(dados).filter((valor) => valor !== undefined);
  if (informados.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Informe ao menos um campo para corrigir'
    });
  }
};

const corrigirAlergiaSchema = z.object({
  alergia: z.string().trim().min(2, 'Informe a alergia').max(120, 'Nome da alergia muito longo').optional(),
  gravidade: z.enum(['leve', 'moderada', 'grave'], {
    error: 'Gravidade deve ser leve, moderada ou grave'
  }).optional(),
  observacoes: textoOpcional(400, 'A observação da alergia')
}).superRefine(exigeAlgumCampo);

const corrigirVacinaSchema = z.object({
  nome_vacina: z.string().trim().min(2, 'Informe a vacina').max(120, 'Nome da vacina muito longo').optional(),
  laboratorio: textoOpcional(120, 'O laboratório'),
  lote: textoOpcional(60, 'O lote'),
  data_aplicacao: z.coerce.date({ error: 'A data de aplicação inválida' }).optional(),
  proxima_dose: dataOpcional('A data da próxima dose')
}).superRefine((dados: any, ctx: any) => {
  exigeAlgumCampo(dados, ctx);
  // Só dá para comparar quando as duas datas vêm no mesmo PUT; a checagem contra
  // a data já gravada fica no controller, que conhece o registro atual.
  if (dados.proxima_dose && dados.data_aplicacao && dados.proxima_dose <= dados.data_aplicacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proxima_dose'],
      message: 'A próxima dose precisa ser depois da aplicação'
    });
  }
});

const corrigirMedicamentoSchema = z.object({
  nome_medicamento: z.string().trim().min(2, 'Informe o medicamento').max(160, 'Nome do medicamento muito longo').optional(),
  dosagem: z.string().trim().min(1, 'Informe a dosagem').max(120, 'Dosagem muito longa').optional(),
  frequencia_horas: z.coerce.number()
    .int('A frequência deve ser um número inteiro de horas')
    .positive('A frequência deve ser maior que zero')
    .max(8760, 'Frequência acima do limite')
    .optional(),
  uso_continuo: z.coerce.boolean().optional(),
  data_inicio: z.coerce.date({ error: 'A data de início inválida' }).optional(),
  data_fim: dataOpcional('A data de término'),
  observacoes: textoOpcional(400, 'A observação do medicamento')
}).superRefine((dados: any, ctx: any) => {
  exigeAlgumCampo(dados, ctx);
  if (dados.data_fim && dados.data_inicio && dados.data_fim < dados.data_inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['data_fim'],
      message: 'O término não pode ser antes do início'
    });
  }
});

/**
 * O motivo é o que sobra na auditoria depois que o registro sai da ficha. Cinco
 * caracteres é o mínimo que impede o "x" de quem só quer fechar o modal.
 */
const MOTIVO_MINIMO = 5;

const removerRegistroClinicoSchema = z.object({
  motivo: z.string()
    .trim()
    .min(MOTIVO_MINIMO, `Descreva o motivo da remoção com pelo menos ${MOTIVO_MINIMO} caracteres`)
    .max(500, 'O motivo deve ter no máximo 500 caracteres')
});

export {
  MOTIVO_MINIMO,
  corrigirAlergiaSchema,
  corrigirVacinaSchema,
  corrigirMedicamentoSchema,
  removerRegistroClinicoSchema
};
