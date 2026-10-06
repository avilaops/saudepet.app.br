import { z } from 'zod';

/**
 * Lembretes do pet.
 *
 * A tabela `lembretes_pet` nasceu com a migration do prontuário e só ganhou
 * escrita no fechamento do atendimento (retorno sugerido e reforço de vacina).
 * Este schema é a porta do tutor: o que ele cria por conta própria — vermífugo,
 * banho, medicação — e a conclusão do que já existe.
 */

// Os mesmos tipos citados no comentário do modelo. `outro` existe para o que o
// tutor inventar sem que a gente precise de migration a cada categoria nova.
const TIPOS = ['vacina', 'medicamento', 'retorno', 'higienizacao', 'outro'];

const createLembreteSchema = z.object({
  pet_id: z.string().uuid('Pet inválido'),
  titulo: z.string().trim().min(2, 'Informe o lembrete').max(120, 'Título muito longo'),
  tipo: z.enum(TIPOS, {
    error: `Tipo deve ser um de: ${TIPOS.join(', ')}`
  }).default('outro'),
  data_lembrete: z.coerce.date({
    error: 'Informe a data do lembrete'
  })
});

const concluirLembreteSchema = z.object({
  // Reabrir é o mesmo endpoint com `false`: marcar concluído por engano não pode
  // custar um lembrete de vacina.
  concluido: z.coerce.boolean().default(true)
});

export {
  TIPOS as TIPOS_DE_LEMBRETE,
  createLembreteSchema,
  concluirLembreteSchema
};
