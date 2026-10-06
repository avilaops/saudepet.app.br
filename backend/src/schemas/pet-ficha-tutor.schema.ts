import { z } from 'zod';

/**
 * Ficha de saúde preenchida pelo TUTOR no cadastro do pet (v1.0): alergias,
 * medicamentos em uso e vacinas já tomadas.
 *
 * Mesmas tabelas que o veterinário alimenta no prontuário — o que o tutor
 * declara em casa é o que o profissional lê antes de medicar. A correção e a
 * remoção auditadas continuam em `ficha-clinica.schema` (veterinário/admin);
 * o tutor só adiciona e remove o que ele mesmo declarou.
 */

const texto = (max: number) => z.string().trim().max(max);

const dataOpcional = z.preprocess(
  (valor) => (valor === '' || valor === null || valor === undefined ? undefined : valor),
  z.coerce.date({ message: 'Data inválida' }).optional()
);

const criarAlergiaTutorSchema = z.object({
  alergia: texto(120).min(2, 'Informe a alergia'),
  gravidade: z.enum(['leve', 'moderada', 'grave'], { message: 'Gravidade deve ser leve, moderada ou grave' })
    .default('moderada'),
  observacoes: texto(500).optional().nullable()
});

const criarMedicamentoTutorSchema = z.object({
  nome_medicamento: texto(120).min(2, 'Informe o medicamento'),
  dosagem: texto(60).min(1, 'Informe a dosagem (ex.: 10mg, 1 gota/kg)'),
  frequencia_horas: z.coerce.number().int().min(1, 'Frequência mínima: 1 hora').max(720, 'Frequência máxima: 30 dias'),
  uso_continuo: z.preprocess((v) => v === true || v === 'true', z.boolean()).default(false),
  data_inicio: dataOpcional,
  data_fim: dataOpcional,
  observacoes: texto(500).optional().nullable()
}).superRefine((dados: any, ctx: any) => {
  if (dados.data_inicio && dados.data_fim && dados.data_fim < dados.data_inicio) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['data_fim'], message: 'Fim não pode ser antes do início' });
  }
});

const criarVacinaTutorSchema = z.object({
  nome_vacina: texto(120).min(2, 'Informe a vacina'),
  data_aplicacao: z.coerce.date({ message: 'Data de aplicação inválida' })
    .max(new Date(), 'Data de aplicação não pode estar no futuro'),
  proxima_dose: dataOpcional,
  laboratorio: texto(80).optional().nullable(),
  lote: texto(40).optional().nullable(),
  veterinario_nome: texto(100).optional().nullable()
});

export {
  criarAlergiaTutorSchema,
  criarMedicamentoTutorSchema,
  criarVacinaTutorSchema
};
