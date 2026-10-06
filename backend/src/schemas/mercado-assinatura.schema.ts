import { z } from 'zod';

/**
 * Contrato de entrada da assinatura de ração (Saúde Pet Mercado, terceira fatia).
 *
 * O que chega do navegador é validado AQUI, antes do controller: forma,
 * limites e enumerações. A regra de negócio (loja aceita assinatura? produto
 * exige receita? endereço no raio?) continua no serviço, porque depende do
 * banco. Os dois juntos são o contrato: este arquivo diz o que é um pedido
 * bem formado; o serviço diz o que é um pedido possível.
 */

const uuid = z.string().uuid('Identificador inválido');

const item = z.object({
  produto_id: uuid,
  quantidade: z.coerce.number().int('Quantidade deve ser inteira').min(1, 'Mínimo 1').max(10, 'Máximo 10 por produto').default(1)
});

/** Endereço vai como cópia: o pedido de cada ciclo guarda o que estava aqui. */
const endereco = z.object({
  endereco: z.string().trim().min(5, 'Informe o endereço').max(200),
  cep: z.string().trim().max(9).optional().nullable(),
  numero: z.string().trim().max(20).optional().nullable(),
  complemento: z.string().trim().max(100).optional().nullable(),
  cidade: z.string().trim().max(100).optional().nullable(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable()
});

const frequencia = z.coerce.number().int('Frequência em dias inteiros').min(7, 'Mínimo 7 dias').max(90, 'Máximo 90 dias');

const criarAssinaturaSchema = z.object({
  itens: z.array(item).min(1, 'Escolha pelo menos um produto').max(10, 'No máximo 10 produtos por assinatura'),
  frequencia_dias: frequencia.optional(),
  pet_id: uuid.optional().nullable(),
  entrega_tipo: z.enum(['retirada', 'combinar', 'loja'], { message: 'Entrega deve ser retirada, combinar ou loja' }).default('retirada'),
  endereco: endereco.optional().nullable(),
  observacao: z.string().trim().max(500).optional().nullable(),
  gerar_primeiro_ciclo: z.boolean().optional().default(true)
}).superRefine((dados, ctx) => {
  if (dados.entrega_tipo !== 'retirada' && !dados.endereco) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endereco'], message: 'Informe o endereço de entrega' });
  }
  if (dados.entrega_tipo === 'loja' && (dados.endereco?.latitude == null || dados.endereco?.longitude == null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['endereco'], message: 'Entrega pela loja exige o endereço com localização (latitude/longitude)' });
  }
});

const alterarAssinaturaSchema = z.object({
  frequencia_dias: frequencia.optional(),
  itens: z.array(item).max(10).optional()
}).refine((dados) => dados.frequencia_dias !== undefined || (dados.itens && dados.itens.length > 0), {
  message: 'Informe a nova frequência ou as novas quantidades'
});

const cancelarAssinaturaSchema = z.object({
  motivo: z.string().trim().max(300).optional().nullable()
});

const sugestaoDeFrequenciaSchema = z.object({
  produto_id: uuid,
  pet_id: uuid.optional(),
  quantidade: z.coerce.number().int().min(1).max(10).optional()
});

export {
  criarAssinaturaSchema,
  alterarAssinaturaSchema,
  cancelarAssinaturaSchema,
  sugestaoDeFrequenciaSchema
};
