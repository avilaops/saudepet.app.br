import { z } from 'zod';

/**
 * Fechamento clínico do atendimento.
 *
 * As tabelas `prontuarios_eletronicos`, `prescricoes_itens` e `solicitacoes_exames`
 * existem desde a migration `20260812180029` mas nunca receberam uma linha: o
 * atendimento era encerrado com três campos de texto livre em `Solicitacao`
 * (`diagnostico`, `receita`, `observacoes`) e um PDF. Este schema é a porta de
 * entrada do registro estruturado.
 *
 * A tela de plantão (`VetOnlineDashboard`) envia o formato antigo
 * (`diagnostico`/`receita`/`observacoes`). Ele continua aceito e é normalizado
 * para os campos clínicos — o que muda é que agora sempre existe uma hipótese
 * diagnóstica, sem a qual o atendimento não fecha.
 */

const textoOpcional = (max: number, campo: string) => z.string()
  .trim()
  .max(max, `${campo} deve ter no máximo ${max} caracteres`)
  .optional()
  .nullable()
  .transform((valor) => valor || null);

const prescricaoItemSchema = z.object({
  medicamento: z.string().trim().min(2, 'Informe o medicamento').max(160, 'Nome do medicamento muito longo'),
  concentracao: textoOpcional(80, 'A concentração'),
  // O nome da coluna no banco é `forma_farmacia`; aqui usamos o termo correto e
  // o controller faz a ponte na hora de gravar.
  forma_farmaceutica: textoOpcional(60, 'A forma farmacêutica'),
  posologia: z.string().trim().min(3, 'Informe a posologia').max(400, 'Posologia muito longa'),
  duracao_dias: z.coerce.number()
    .int('Duração em dias deve ser um número inteiro')
    .positive('Duração em dias deve ser maior que zero')
    .max(365, 'Duração em dias acima do limite')
    .optional()
    .nullable()
});

const exameSolicitadoSchema = z.object({
  nome_exame: z.string().trim().min(2, 'Informe o exame').max(160, 'Nome do exame muito longo'),
  justificativa: textoOpcional(400, 'A justificativa')
});

/**
 * Alergia é o único dado clínico deste fechamento que não pertence ao atendimento
 * e sim ao animal: quem prescrever daqui a seis meses precisa saber. Por isso vai
 * para `pets_alergias`, e não para o prontuário do dia.
 */
const alergiaSchema = z.object({
  alergia: z.string().trim().min(2, 'Informe a alergia').max(120, 'Nome da alergia muito longo'),
  gravidade: z.enum(['leve', 'moderada', 'grave'], {
    error: 'Gravidade deve ser leve, moderada ou grave'
  }).default('moderada'),
  observacoes: textoOpcional(400, 'A observação da alergia')
});

const dataOpcional = (campo: string) => z.coerce.date({ error: `${campo} inválida` })
  .optional()
  .nullable();

/**
 * Vacina aplicada durante o atendimento. Vai para `pets_vacinas`, que a carteira
 * digital do tutor e a tag pública do pet já liam — e que estava vazia, apesar do
 * "as vacinas aplicadas pelos veterinários são lançadas automaticamente aqui"
 * escrito na própria tela do tutor.
 */
const vacinaAplicadaSchema = z.object({
  nome_vacina: z.string().trim().min(2, 'Informe a vacina').max(120, 'Nome da vacina muito longo'),
  laboratorio: textoOpcional(120, 'O laboratório'),
  lote: textoOpcional(60, 'O lote'),
  data_aplicacao: dataOpcional('A data de aplicação'),
  proxima_dose: dataOpcional('A data da próxima dose')
}).superRefine((dados: any, ctx: any) => {
  const aplicacao = dados.data_aplicacao || new Date();
  if (dados.proxima_dose && dados.proxima_dose <= aplicacao) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['proxima_dose'],
      message: 'A próxima dose precisa ser depois da aplicação'
    });
  }
});

/**
 * Medicação que o animal passa a usar — não confundir com `PrescricaoItem`, que é
 * a receita daquele atendimento. Esta é a lista do que está em uso hoje, que o
 * próximo veterinário precisa ver antes de prescrever qualquer coisa.
 */
const medicamentoEmUsoSchema = z.object({
  nome_medicamento: z.string().trim().min(2, 'Informe o medicamento').max(160, 'Nome do medicamento muito longo'),
  dosagem: z.string().trim().min(1, 'Informe a dosagem').max(120, 'Dosagem muito longa'),
  frequencia_horas: z.coerce.number()
    .int('A frequência deve ser um número inteiro de horas')
    .positive('A frequência deve ser maior que zero')
    .max(8760, 'Frequência acima do limite'),
  uso_continuo: z.coerce.boolean().default(false),
  data_inicio: dataOpcional('A data de início'),
  data_fim: dataOpcional('A data de término'),
  observacoes: textoOpcional(400, 'A observação do medicamento')
}).superRefine((dados: any, ctx: any) => {
  const inicio = dados.data_inicio || new Date();
  if (dados.data_fim && dados.data_fim < inicio) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['data_fim'],
      message: 'O término não pode ser antes do início'
    });
  }
});

const finalizarAtendimentoSchema = z.object({
  queixa_principal: textoOpcional(2000, 'A queixa principal'),
  exame_fisico: textoOpcional(4000, 'O exame físico'),
  hipotese_diagnostica: textoOpcional(2000, 'A hipótese diagnóstica'),
  diagnostico_definitivo: textoOpcional(2000, 'O diagnóstico definitivo'),
  orientacoes_tutor: textoOpcional(4000, 'As orientações ao tutor'),

  retorno_sugerido_em: z.coerce.date({ error: 'Data de retorno inválida' })
    .optional()
    .nullable(),

  prescricoes: z.array(prescricaoItemSchema).max(30, 'Máximo de 30 medicamentos por receita').default([]),
  exames: z.array(exameSolicitadoSchema).max(30, 'Máximo de 30 exames por atendimento').default([]),
  alergias: z.array(alergiaSchema).max(15, 'Máximo de 15 alergias por atendimento').default([]),
  vacinas: z.array(vacinaAplicadaSchema).max(10, 'Máximo de 10 vacinas por atendimento').default([]),
  medicamentos: z.array(medicamentoEmUsoSchema).max(20, 'Máximo de 20 medicações em uso por atendimento').default([]),

  // Formato antigo, ainda enviado pela tela de plantão.
  diagnostico: textoOpcional(2000, 'O diagnóstico'),
  receita: textoOpcional(5000, 'A receita'),
  observacoes: textoOpcional(4000, 'As observações')
}).transform((dados) => ({
  ...dados,
  // No formato antigo o campo `diagnostico` é rotulado "Diagnóstico definitivo" na
  // tela de plantão; ele vira as duas coisas, porque a hipótese é obrigatória no
  // registro clínico e um diagnóstico fechado também responde por ela.
  hipotese_diagnostica: dados.hipotese_diagnostica || dados.diagnostico || null,
  diagnostico_definitivo: dados.diagnostico_definitivo || dados.diagnostico || null,
  // "Recomendações e observações ao tutor" do formato antigo são as orientações.
  orientacoes_tutor: dados.orientacoes_tutor || dados.observacoes || null,
  // Texto livre de receita do formato antigo: sem itens estruturados por trás,
  // segue valendo como prescrição do atendimento.
  receita: dados.receita || null
})).superRefine((dados: any, ctx: any) => {
  if (!dados.hipotese_diagnostica) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['hipotese_diagnostica'],
      message: 'Informe ao menos a hipótese diagnóstica para encerrar o atendimento.'
    });
  }

  if (dados.retorno_sugerido_em && Number.isNaN(dados.retorno_sugerido_em.getTime())) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['retorno_sugerido_em'],
      message: 'Data de retorno inválida'
    });
  }
});

export {
  finalizarAtendimentoSchema,
  prescricaoItemSchema,
  exameSolicitadoSchema,
  alergiaSchema,
  vacinaAplicadaSchema,
  medicamentoEmUsoSchema
};
