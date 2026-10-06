import { z } from 'zod';

// Somente dígitos, para validar CPF/CNPJ/telefone sem depender da máscara enviada pelo app
const digits = (value: unknown) => String(value || '').replace(/\D/g, '');

const TIPOS_CHAVE_PIX = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'];

// A chave PIX só faz sentido junto com o tipo declarado: uma string de 11 dígitos é
// um CPF válido e um e-mail inválido. Validar o par evita criar subconta no Asaas
// com uma chave que o banco vai recusar na hora do primeiro repasse.
const chavePixValida = (chave: string, tipo: string) => {
  const valor = String(chave || '').trim();
  if (!valor) return false;

  if (tipo === 'CPF') return digits(valor).length === 11;
  if (tipo === 'CNPJ') return digits(valor).length === 14;
  if (tipo === 'EMAIL') return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor);
  if (tipo === 'PHONE') {
    const numero = digits(valor);
    // 10 (fixo) ou 11 (celular) dígitos, com ou sem o 55 do país
    return [10, 11, 12, 13].includes(numero.length);
  }
  if (tipo === 'RANDOM') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor);
  return false;
};

const contaBancariaSchema = z.object({
  tipoChavePix: z.enum(TIPOS_CHAVE_PIX, {
    error: `Tipo de chave PIX deve ser um de: ${TIPOS_CHAVE_PIX.join(', ')}`
  }),

  chavePix: z.string()
    .trim()
    .min(1, 'Informe a chave PIX')
    .max(120, 'Chave PIX muito longa'),

  banco: z.string()
    .trim()
    .regex(/^\d{1,3}$/, 'Código do banco deve ter até 3 dígitos (ex.: 001, 341, 260)')
    .transform((value: string) => value.padStart(3, '0')),

  agencia: z.string()
    .trim()
    .regex(/^\d{1,6}(-\d)?$/, 'Agência inválida (ex.: 0001 ou 0001-2)'),

  conta: z.string()
    .trim()
    .regex(/^\d{1,15}-?[\dxX]$/, 'Conta inválida (ex.: 12345-6)'),

  tipoConta: z.enum(['corrente', 'poupanca']).default('corrente'),

  titular: z.string()
    .trim()
    .min(3, 'Nome do titular deve ter ao menos 3 caracteres')
    .max(120, 'Nome do titular muito longo')
    .optional(),

  cpfCnpjTitular: z.string()
    .trim()
    .refine((value: unknown) => [11, 14].includes(digits(value).length), 'CPF/CNPJ do titular inválido')
    .optional()
}).refine(
  (data) => chavePixValida(data.chavePix, data.tipoChavePix),
  { path: ['chavePix'], message: 'A chave PIX não corresponde ao tipo selecionado' }
);

// Cobrança criada pelo próprio veterinário para um atendimento seu.
// Só PIX: cartão exige os dados do cartão do tutor, que o vet não pode digitar.
const criarCobrancaSchema = z.object({
  atendimentoId: z.string().uuid('ID do atendimento inválido'),

  valor: z.coerce.number({ error: 'Valor inválido' })
    .positive('Valor deve ser maior que zero')
    .max(50000, 'Valor acima do limite permitido por cobrança'),

  metodo: z.enum(['PIX']).default('PIX'),

  descricao: z.string().trim().max(300, 'Descrição muito longa').optional()
});

export {
  contaBancariaSchema,
  criarCobrancaSchema,
  chavePixValida,
  TIPOS_CHAVE_PIX
};
