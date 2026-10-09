import { naoEstaNoFuturo } from '../utils/datas';
import { z } from 'zod';

// Campos numéricos chegam de <input> como string: "5" vale 5, e vazio/null
// significa "não informado" (z.coerce transformaria "" em 0 — errado).
const numeroDeFormulario = (schema: any) =>
  z.preprocess((valor) => {
    if (valor === '' || valor === null || valor === undefined) return undefined;
    const numero = Number(valor);
    return Number.isNaN(numero) ? valor : numero;
  }, schema.optional());


// Schema para criação de pet
const createPetSchema = z.object({
  nome: z.string()
    .min(2, 'Nome do pet deve ter no mínimo 2 caracteres')
    .max(50, 'Nome do pet deve ter no máximo 50 caracteres')
    .trim(),

  tipo: z.string()
    .min(2, 'Tipo do pet é obrigatório (ex: cachorro, gato)')
    .max(30, 'Tipo do pet deve ter no máximo 30 caracteres')
    .trim(),

  raca: z.string()
    .max(50, 'Raça deve ter no máximo 50 caracteres')
    .trim()
    .optional()
    .nullable(),

  idade: numeroDeFormulario(z.number()
    .int('Idade deve ser um número inteiro')
    .min(0, 'Idade não pode ser negativa')
    .max(50, 'Idade deve ser no máximo 50 anos')),

  peso: numeroDeFormulario(z.number()
    .positive('Peso deve ser positivo')
    .max(500, 'Peso deve ser no máximo 500kg')),

  foto: z.string()
    .url('URL da foto inválida')
    .optional()
    .nullable(),

  // Estes campos existem no banco desde sempre e NUNCA eram gravados: o
  // controller lia só nome, tipo, raça, idade e peso, e o Zod descartava o
  // resto em silêncio. O porte aparecia vazio até na tag pública da coleira.
  especie: z.string().max(30).trim().optional().nullable(),

  sexo: z.enum(['macho', 'femea'], { message: 'Sexo deve ser macho ou femea' })
    .optional()
    .nullable(),

  data_nascimento: z.coerce.date({ message: 'Data de nascimento inválida' })
    .refine(naoEstaNoFuturo, 'Data de nascimento não pode estar no futuro')
    .optional()
    .nullable(),

  porte: z.enum(['pequeno', 'medio', 'grande'], { message: 'Porte deve ser pequeno, medio ou grande' })
    .optional()
    .nullable(),

  cor: z.string().max(40).trim().optional().nullable(),

  pedigree: z.string().max(60).trim().optional().nullable(),

  castrado: z.preprocess((valor) => {
    if (valor === 'true' || valor === true) return true;
    if (valor === 'false' || valor === false) return false;
    return undefined;
  }, z.boolean().optional()),

  microchip: z.string().max(40).trim().optional().nullable(),

  // Cardiopatia, epilepsia, diabetes: o que muda a conduta antes de qualquer
  // exame. Fica em campo próprio, não no texto livre.
  condicoes_preexistentes: z.string().max(1000).trim().optional().nullable(),

  observacoes: z.string().max(1000).trim().optional().nullable(),
});

// Schema para atualização de pet (todos os campos opcionais)
const updatePetSchema = z.object({
  nome: z.string()
    .min(2, 'Nome do pet deve ter no mínimo 2 caracteres')
    .max(50, 'Nome do pet deve ter no máximo 50 caracteres')
    .trim()
    .optional(),

  tipo: z.string()
    .min(2, 'Tipo do pet deve ter no mínimo 2 caracteres')
    .max(30, 'Tipo do pet deve ter no máximo 30 caracteres')
    .trim()
    .optional(),

  raca: z.string()
    .max(50, 'Raça deve ter no máximo 50 caracteres')
    .trim()
    .optional()
    .nullable(),

  idade: numeroDeFormulario(z.number()
    .int('Idade deve ser um número inteiro')
    .min(0, 'Idade não pode ser negativa')
    .max(50, 'Idade deve ser no máximo 50 anos')),

  peso: numeroDeFormulario(z.number()
    .positive('Peso deve ser positivo')
    .max(500, 'Peso deve ser no máximo 500kg')),

  foto: z.string()
    .url('URL da foto inválida')
    .optional()
    .nullable(),

  // Mesmos campos do cadastro: quem não preencheu na pressa da primeira vez
  // completa depois, e é o caso comum.
  especie: z.string().max(30).trim().optional().nullable(),
  sexo: z.enum(['macho', 'femea'], { message: 'Sexo deve ser macho ou femea' }).optional().nullable(),
  data_nascimento: z.coerce.date({ message: 'Data de nascimento inválida' })
    .refine(naoEstaNoFuturo, 'Data de nascimento não pode estar no futuro')
    .optional()
    .nullable(),
  porte: z.enum(['pequeno', 'medio', 'grande'], { message: 'Porte deve ser pequeno, medio ou grande' }).optional().nullable(),
  cor: z.string().max(40).trim().optional().nullable(),
  pedigree: z.string().max(60).trim().optional().nullable(),
  castrado: z.preprocess((valor) => {
    if (valor === 'true' || valor === true) return true;
    if (valor === 'false' || valor === false) return false;
    return undefined;
  }, z.boolean().optional()),
  microchip: z.string().max(40).trim().optional().nullable(),
  condicoes_preexistentes: z.string().max(1000).trim().optional().nullable(),
  observacoes: z.string().max(1000).trim().optional().nullable()
});

export {
  createPetSchema,
  updatePetSchema
};
