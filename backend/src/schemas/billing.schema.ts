import { z } from 'zod';

// ═══════════════════════════════════════════════════════
// SCHEMAS DE BILLING E PAGAMENTOS
// ═══════════════════════════════════════════════════════

const tipoTransacaoEnum = z.enum([
  'pagamento_atendimento',
  'assinatura_plano',
  'comissao_plataforma',
  'transferencia_vet',
  'estorno',
  'bonus'
]);

const statusTransacaoEnum = z.enum([
  'pendente',
  'processando',
  'aprovada',
  'concluida',
  'falhou',
  'cancelada',
  'estornada'
]);

const metodoPagamentoEnum = z.enum([
  'cartao_credito',
  'cartao_debito',
  'pix',
  'boleto',
  'saldo_wallet'
]);

// Schema para criar transação de pagamento
const criarPagamentoSchema = z.object({
  atendimento_id: z.string().uuid('ID de atendimento inválido'),
  valor_total: z.number().positive('Valor deve ser positivo'),
  metodo_pagamento: metodoPagamentoEnum,
  dados_pagamento: z.object({
    // Cartão
    numero_cartao: z.string().optional(),
    nome_cartao: z.string().optional(),
    validade: z.string().optional(),
    cvv: z.string().optional(),

    // PIX
    chave_pix: z.string().optional(),

    // Dados do pagador
    cpf: z.string().optional(),
    email: z.string().email().optional()
  }).optional()
});

// Schema para processar split de pagamento
const processarSplitSchema = z.object({
  transacao_id: z.string().uuid(),
  percentual_plataforma: z.number().min(0).max(100).default(15),
  valor_total: z.number().positive()
});

// Schema para criar plano de assinatura
const criarPlanoSchema = z.object({
  nome: z.string().min(3).max(100),
  descricao: z.string().max(500).optional(),
  tipo_usuario: z.enum(['tutor', 'veterinario']),
  valor_mensal: z.number().positive('Valor mensal deve ser positivo'),
  // Percentual de desconto do plano nos atendimentos. Vivia só no texto de
  // benefícios ("10% de desconto..."), que é vitrine e não regra.
  desconto_pct: z.number().min(0).max(100).optional(),
  // Quantos atendimentos do mês recebem o desconto. NÃO é teto de atendimento.
  limite_atendimentos: z.number().int().positive().optional(),
  beneficios: z.array(z.string()).min(1, 'Pelo menos um benefício é necessário')
});

// Schema para atualizar plano
const atualizarPlanoSchema = z.object({
  nome: z.string().min(3).max(100).optional(),
  descricao: z.string().max(500).optional(),
  valor_mensal: z.number().positive().optional(),
  desconto_pct: z.number().min(0).max(100).optional(),
  limite_atendimentos: z.number().int().positive().optional(),
  beneficios: z.array(z.string()).optional(),
  ativo: z.boolean().optional()
});

// Schema para assinar plano
const assinarPlanoSchema = z.object({
  plano_id: z.string().uuid('ID de plano inválido'),
  metodo_pagamento: metodoPagamentoEnum,
  // Plano pago abre cobrança de verdade no gateway. Cartão exige o token que o
  // SDK gera NO NAVEGADOR — número e CVV não devem tocar o nosso servidor.
  cardToken: z.string().min(10).optional(),
  parcelas: z.coerce.number().int().min(1).max(12).optional(),
  aceitar_termos: z.literal(true, {
    error: 'Você deve aceitar os termos e condições'
  })
});

// Schema para cancelar assinatura
const cancelarAssinaturaSchema = z.object({
  motivo: z.string().min(10, 'Por favor, explique o motivo do cancelamento').max(500).optional()
});

// Schema para solicitar transferência (veterinário)
const solicitarTransferenciaSchema = z.object({
  valor: z.number().positive('Valor deve ser positivo'),
  dados_bancarios: z.object({
    banco: z.string(),
    agencia: z.string(),
    conta: z.string(),
    tipo_conta: z.enum(['corrente', 'poupanca']),
    cpf_cnpj: z.string(),
    titular: z.string()
  })
});

// Schema para consultar extrato
const consultarExtratoSchema = z.object({
  tipo: tipoTransacaoEnum.optional(),
  status: statusTransacaoEnum.optional(),
  data_inicio: z.string().datetime().optional(),
  data_fim: z.string().datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

// Schema para gerar fatura
const gerarFaturaSchema = z.object({
  usuario_id: z.string().uuid(),
  descricao: z.string().min(5).max(200),
  valor: z.number().positive(),
  vencimento: z.string().datetime()
});

export {
  criarPagamentoSchema,
  processarSplitSchema,
  criarPlanoSchema,
  atualizarPlanoSchema,
  assinarPlanoSchema,
  cancelarAssinaturaSchema,
  solicitarTransferenciaSchema,
  consultarExtratoSchema,
  gerarFaturaSchema
};
