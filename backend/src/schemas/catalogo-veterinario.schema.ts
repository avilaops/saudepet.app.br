import { z } from 'zod';
import { DEFINICAO_POR_CODIGO, DEFINICOES_CATALOGO_VETERINARIO } from '../services/catalogo-veterinario.definitions';

const itemCatalogoSchema = z.object({
  codigo: z.string().trim().refine((codigo) => DEFINICAO_POR_CODIGO.has(codigo), 'Item de catálogo inválido'),
  ativo: z.boolean(),
  preco: z.union([
    z.coerce.number().positive('O preço deve ser maior que zero').max(50000, 'Preço acima do limite permitido'),
    z.null()
  ])
}).superRefine((item, contexto) => {
  if (item.ativo && item.preco == null) {
    contexto.addIssue({ code: 'custom', path: ['preco'], message: 'Informe o preço para ativar este item' });
  }
});

export const salvarCatalogoVeterinarioSchema = z.object({
  itens: z.array(itemCatalogoSchema)
    .min(1, 'Envie ao menos um item do catálogo')
    .max(DEFINICOES_CATALOGO_VETERINARIO.length, 'Catálogo acima do limite')
}).superRefine(({ itens }, contexto) => {
  const vistos = new Set<string>();
  itens.forEach((item, indice) => {
    if (vistos.has(item.codigo)) {
      contexto.addIssue({ code: 'custom', path: ['itens', indice, 'codigo'], message: 'Item repetido no catálogo' });
    }
    vistos.add(item.codigo);
  });
});

export type SalvarCatalogoVeterinarioInput = z.infer<typeof salvarCatalogoVeterinarioSchema>;
