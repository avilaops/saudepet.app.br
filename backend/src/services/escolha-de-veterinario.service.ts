import prisma from '../config/database';
import type { TipoAtendimento } from '@prisma/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../middleware/error.middleware';

/**
 * Quando o tutor escolhe o profissional.
 *
 * O plano prevê o tutor vendo uma lista — foto, CRMV, especialidade, avaliação,
 * distância — e escolhendo. O que existe é fila aberta: o chamado vai para os
 * plantonistas próximos e vale o primeiro que aceitar.
 *
 * Os dois estão certos, para casos diferentes, e é isso que este serviço
 * resolve:
 *
 * - **Emergência e consulta domiciliar** continuam na fila aberta. Quem tem o
 *   animal passando mal na frente não quer comparar currículos; quer alguém a
 *   caminho no menor tempo possível.
 * - **Vacinação, avaliação e consulta de rotina** passam a permitir escolha.
 *   Não há pressa, e aí escolher faz sentido: é o mesmo motivo pelo qual
 *   ninguém escolhe motorista de ambulância, mas escolhe dentista.
 *
 * Escolher não é atribuir à força. O chamado nasce dirigido àquele profissional
 * — só ele é avisado — e ele aceita ou recusa como sempre. Recusando, o chamado
 * cai na fila aberta em vez de morrer: o tutor não pode ficar sem atendimento
 * porque escolheu alguém que estava ocupado.
 */

/** Onde a escolha faz sentido. */
export const TIPOS_COM_ESCOLHA = ['vacinacao', 'avaliacao', 'consulta_rotina'];

export function permiteEscolha(tipo: string | null | undefined): boolean {
  return TIPOS_COM_ESCOLHA.includes(String(tipo || ''));
}

/** Distância em linha reta, para ordenar a lista. */
function distanciaKm(
  aLat: number | null,
  aLng: number | null,
  bLat: number | null,
  bLng: number | null
): number | null {
  if (aLat == null || aLng == null || bLat == null || bLng == null) return null;
  const R = 6371;
  const rad = (grau: number) => (grau * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)) * 10) / 10;
}

export type ProfissionalNaVitrine = {
  id: string;
  nome: string;
  foto: string | null;
  crmv: string;
  especialidade: string;
  sobre: string | null;
  area_atuacao: string | null;
  avaliacao_media: number | null;
  total_avaliacoes: number;
  atendimentos_concluidos: number;
  distancia_km: number | null;
  online: boolean;
  preco: number | null;
};

/**
 * Quem pode atender este pedido, do mais perto ao mais bem avaliado.
 *
 * Aqui NÃO se exige estar de plantão: o pedido é marcado, não imediato, e uma
 * lista vazia porque ninguém está online às três da tarde de terça seria uma
 * vitrine inútil. O que se exige é aprovação e cadastro completo — os mesmos
 * requisitos de quem entra de plantão.
 */
export async function profissionaisPara({
  tenantId,
  tipo,
  latitude,
  longitude
}: {
  tenantId: string;
  tipo: string;
  latitude?: number | null;
  longitude?: number | null;
}): Promise<ProfissionalNaVitrine[]> {
  if (!permiteEscolha(tipo)) return [];

  const veterinarios = await prisma.veterinario.findMany({
    where: {
      tenant_id: tenantId,
      aprovado_admin: true,
      // Sem conta para receber, aceitar seria criar um repasse sem destino.
      dados_bancarios: { not: null }
    },
    select: {
      id: true,
      crmv: true,
      especialidade: true,
      sobre: true,
      area_atuacao: true,
      avaliacao_media: true,
      total_atendimentos: true,
      latitude: true,
      longitude: true,
      online: true,
      catalogo_itens: {
        where: { tipo_atendimento: tipo as TipoAtendimento, ativo: true },
        select: { preco: true },
        take: 1
      },
      usuario: { select: { nome: true, foto_perfil: true } }
    },
    take: 60
  });

  const notas = await prisma.avaliacao.groupBy({
    by: ['veterinario_id'],
    where: { tenant_id: tenantId, autor_papel: 'tutor' },
    _count: { _all: true }
  }).catch(() => [] as Array<{ veterinario_id: string; _count: { _all: number } }>);

  const contagem = new Map(
    (Array.isArray(notas) ? notas : []).map((linha) => [linha.veterinario_id, linha._count._all])
  );

  const lista = veterinarios.map((vet) => ({
    id: vet.id,
    nome: vet.usuario?.nome || 'Veterinário',
    foto: vet.usuario?.foto_perfil || null,
    crmv: vet.crmv,
    especialidade: vet.especialidade,
    sobre: vet.sobre,
    area_atuacao: vet.area_atuacao,
    avaliacao_media: vet.avaliacao_media != null ? Number(vet.avaliacao_media) : null,
    total_avaliacoes: contagem.get(vet.id) || 0,
    atendimentos_concluidos: vet.total_atendimentos || 0,
    distancia_km: distanciaKm(latitude ?? null, longitude ?? null, vet.latitude, vet.longitude),
    online: Boolean(vet.online),
    preco: vet.catalogo_itens?.[0]?.preco == null ? null : Number(vet.catalogo_itens[0].preco)
  }));

  // Perto primeiro; sem coordenada, quem tem mais avaliação. Quem nunca foi
  // avaliado não afunda: aparece depois dos avaliados, não no fim de tudo, ou
  // profissional novo nunca receberia o primeiro pedido.
  return lista.sort((a, b) => {
    if (a.distancia_km != null && b.distancia_km != null) return a.distancia_km - b.distancia_km;
    if (a.distancia_km != null) return -1;
    if (b.distancia_km != null) return 1;
    return (b.avaliacao_media || 0) - (a.avaliacao_media || 0);
  });
}

/**
 * Confere se este profissional pode receber este pedido dirigido.
 *
 * Devolve o id do veterinário para o chamado nascer apontando para ele, ou
 * lança — escolher alguém que não pode atender precisa falhar na hora, com a
 * tela ainda aberta, e não virar um chamado que ninguém recebe.
 */
export async function validarEscolha({
  tenantId,
  tipo,
  veterinarioId
}: {
  tenantId: string;
  tipo: string;
  veterinarioId: string;
}): Promise<string> {
  if (!permiteEscolha(tipo)) {
    throw new ValidationError(
      'Este tipo de atendimento vai para o primeiro profissional disponível — não é possível escolher.'
    );
  }

  const veterinario = await prisma.veterinario.findFirst({
    where: { id: veterinarioId, tenant_id: tenantId },
    select: { id: true, aprovado_admin: true, dados_bancarios: true }
  });

  if (!veterinario) throw new NotFoundError('Profissional não encontrado');
  if (!veterinario.aprovado_admin || !veterinario.dados_bancarios) {
    throw new ForbiddenError('Este profissional não está disponível para novos atendimentos.');
  }

  return veterinario.id;
}
