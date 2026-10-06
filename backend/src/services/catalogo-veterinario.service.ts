import type { CatalogoItemVeterinario, Prisma, TipoAtendimento } from '@prisma/client';
import prisma from '../config/database';
import { DEFINICOES_CATALOGO_VETERINARIO } from './catalogo-veterinario.definitions';
import type { SalvarCatalogoVeterinarioInput } from '../schemas/catalogo-veterinario.schema';

type ItemGravado = Pick<CatalogoItemVeterinario, 'codigo' | 'preco' | 'ativo' | 'atualizado_em'>;

export type ItemCatalogoPublicado = {
  codigo: string;
  nome: string;
  descricao: string;
  categoria: string;
  tipo_atendimento: TipoAtendimento | null;
  preco: number | null;
  ativo: boolean;
  ordem: number;
  atualizado_em: Date | null;
};

export function montarCatalogo(itensGravados: ItemGravado[]): ItemCatalogoPublicado[] {
  const gravadoPorCodigo = new Map(itensGravados.map((item) => [item.codigo, item]));

  return DEFINICOES_CATALOGO_VETERINARIO.map((definicao) => {
    const gravado = gravadoPorCodigo.get(definicao.codigo);
    return {
      ...definicao,
      preco: gravado?.preco == null ? null : Number(gravado.preco),
      ativo: Boolean(gravado?.ativo),
      atualizado_em: gravado?.atualizado_em || null
    };
  });
}

export async function catalogoDoVeterinario(veterinarioId: string, tenantId: string) {
  const itens = await prisma.catalogoItemVeterinario.findMany({
    where: { veterinario_id: veterinarioId, tenant_id: tenantId },
    select: { codigo: true, preco: true, ativo: true, atualizado_em: true },
    orderBy: { ordem: 'asc' }
  });

  return montarCatalogo(itens);
}

export async function salvarCatalogoDoVeterinario({
  veterinarioId,
  tenantId,
  entrada
}: {
  veterinarioId: string;
  tenantId: string;
  entrada: SalvarCatalogoVeterinarioInput;
}) {
  const recebidoPorCodigo = new Map(entrada.itens.map((item) => [item.codigo, item]));
  const data: Prisma.CatalogoItemVeterinarioCreateManyInput[] = DEFINICOES_CATALOGO_VETERINARIO.map((definicao) => {
    const recebido = recebidoPorCodigo.get(definicao.codigo);
    return {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      codigo: definicao.codigo,
      nome: definicao.nome,
      categoria: definicao.categoria,
      tipo_atendimento: definicao.tipo_atendimento,
      preco: recebido?.preco ?? null,
      ativo: Boolean(recebido?.ativo),
      ordem: definicao.ordem
    };
  });

  await prisma.$transaction(async (tx) => {
    await tx.catalogoItemVeterinario.deleteMany({
      where: { veterinario_id: veterinarioId, tenant_id: tenantId }
    });
    await tx.catalogoItemVeterinario.createMany({ data });
  });

  return catalogoDoVeterinario(veterinarioId, tenantId);
}
