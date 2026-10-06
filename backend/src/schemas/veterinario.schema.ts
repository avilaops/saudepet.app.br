import { z } from 'zod';
import { UFS } from './auth.schema';

// Schema para atualização de dados do veterinário
const updateVeterinarioSchema = z.object({
  especialidade: z.string()
    .min(3, 'Especialidade deve ter no mínimo 3 caracteres')
    .max(100, 'Especialidade deve ter no máximo 100 caracteres')
    .trim()
    .optional(),

  crmv: z.string()
    .min(2, 'CRMV inválido')
    .max(20, 'CRMV deve ter no máximo 20 caracteres')
    .trim()
    .optional(),

  crmv_uf: z.string()
    .trim()
    .toUpperCase()
    .refine((uf: string) => UFS.includes(uf), { message: 'Estado do CRMV inválido' })
    .optional()
    .nullable(),

  raio_atendimento_km: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? v === undefined ? undefined : null : Number(v)),
    z.number().int().min(1).max(300).optional().nullable()
  ),

  area_atuacao: z.string().max(200).trim().optional().nullable(),

  sobre: z.string()
    .max(1000, 'Sobre deve ter no máximo 1000 caracteres')
    .trim()
    .optional()
    .nullable(),

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

// Schema para atualização de status online
const updateOnlineStatusSchema = z.object({
  online: z.boolean({
    error: 'Status online é obrigatório'
  }),

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

// Schema para aprovação/rejeição de veterinário (admin)
const aprovarVeterinarioSchema = z.object({
  aprovado: z.boolean({
    error: 'Status de aprovação é obrigatório'
  })
});

export {
  updateVeterinarioSchema,
  updateOnlineStatusSchema,
  aprovarVeterinarioSchema
};
