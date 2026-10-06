import { Prisma } from '@prisma/client';
import prisma from '../config/database';

/**
 * CRM do veterinário — a clientela dele.
 *
 * Modelo híbrido (decidido em 2026-08-16): o histórico CLÍNICO continua
 * compartilhado dentro do tenant, porque é o que sustenta a continuidade do
 * tratamento quando quem atende hoje não é quem atendeu da última vez. Já a
 * leitura COMERCIAL — nota privada, tag, apelido — pertence a cada
 * veterinário. Por isso toda consulta aqui é chaveada por
 * (veterinario_id + tutor_id), nunca só por tutor.
 */

/** O par que identifica uma ficha, mais o tenant que a contém. */
export interface ChaveFicha {
  tenantId: string;
  veterinarioId: string;
  tutorId: string;
}

/**
 * Cliente Prisma ou transação em andamento. `PrismaClient` satisfaz
 * `TransactionClient`, então o padrão (`prisma`) e o `tx` do chamador
 * entram pelo mesmo parâmetro.
 */
type Db = Prisma.TransactionClient;

export type OrdemDeClientes = 'recentes' | 'antigos' | 'frequentes';

export interface ListarClientesParams {
  tenantId: string;
  veterinarioId: string;
  busca?: string;
  tag?: string;
  favoritos?: boolean;
  /** Valor desconhecido cai no padrão `recentes`. */
  ordem?: string;
  pagina?: number | string;
  porPagina?: number | string;
}

/** O que o vet pode editar na ficha. Campos ausentes ficam como estão. */
export interface DadosDaFicha {
  notas_privadas?: string | null;
  apelido?: string | null;
  favorito?: unknown;
  tags?: unknown;
}

/**
 * Garante que a ficha exista antes de escrever nela.
 *
 * O `upsert` é o ponto que impede a corrida entre dois atendimentos do mesmo
 * tutor fechando quase juntos: sem ele, dois `create` concorrentes violariam a
 * unique (veterinario_id, tutor_id) e um dos fechamentos quebraria.
 */
export async function garantirFicha({ tenantId, veterinarioId, tutorId }: ChaveFicha, tx: Db = prisma) {
  return tx.clienteVeterinario.upsert({
    where: {
      veterinario_id_tutor_id: { veterinario_id: veterinarioId, tutor_id: tutorId }
    },
    update: {},
    create: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      tutor_id: tutorId
    }
  });
}

/**
 * Recalcula os contadores da ficha a partir dos atendimentos reais.
 *
 * Os campos denormalizados existem para a lista de clientes carregar sem
 * varrer o histórico inteiro a cada abertura. Recalcular a partir da fonte
 * (em vez de incrementar) custa uma agregação, mas não desanda: um
 * incremento perdido numa transação revertida deixaria o número mentindo
 * para sempre, e número errado de faturamento mina a confiança na tela toda.
 */
export async function recalcularFicha({ tenantId, veterinarioId, tutorId }: ChaveFicha, tx: Db = prisma) {
  const agregado = await tx.solicitacao.aggregate({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      tutor_id: tutorId
    },
    _count: { _all: true },
    _max: { finalizado_em: true }
  });

  await garantirFicha({ tenantId, veterinarioId, tutorId }, tx);

  return tx.clienteVeterinario.update({
    where: {
      veterinario_id_tutor_id: { veterinario_id: veterinarioId, tutor_id: tutorId }
    },
    data: {
      total_atendimentos: agregado._count._all,
      ultimo_atendimento: agregado._max.finalizado_em
    }
  });
}

// `nulls: 'last'` importa: cliente sem atendimento fechado tem
// `ultimo_atendimento` nulo e, sem isso, o Postgres o jogaria para o topo
// da ordenação decrescente — exatamente o oposto de "mais recentes".
const ORDENACOES: Record<OrdemDeClientes, Prisma.ClienteVeterinarioOrderByWithRelationInput> = {
  recentes: { ultimo_atendimento: { sort: 'desc', nulls: 'last' } },
  antigos: { ultimo_atendimento: { sort: 'asc', nulls: 'last' } },
  frequentes: { total_atendimentos: 'desc' }
};

function ehOrdemConhecida(ordem: string): ordem is OrdemDeClientes {
  return Object.prototype.hasOwnProperty.call(ORDENACOES, ordem);
}

/**
 * Lista a clientela do veterinário.
 *
 * `busca` casa nome/e-mail do tutor e o apelido que o vet deu. `tag` filtra
 * pelo array de tags. A ordenação padrão é por último atendimento porque a
 * pergunta mais comum na tela é "quem eu não vejo há tempo demais".
 */
export async function listarClientes({
  tenantId,
  veterinarioId,
  busca,
  tag,
  favoritos,
  ordem = 'recentes',
  pagina = 1,
  porPagina = 20
}: ListarClientesParams) {
  const where: Prisma.ClienteVeterinarioWhereInput = {
    tenant_id: tenantId,
    veterinario_id: veterinarioId,
    ...(favoritos ? { favorito: true } : {}),
    ...(tag ? { tags: { has: tag } } : {}),
    ...(busca
      ? {
          OR: [
            { apelido: { contains: busca, mode: 'insensitive' } },
            { tutor: { nome: { contains: busca, mode: 'insensitive' } } },
            { tutor: { email: { contains: busca, mode: 'insensitive' } } }
          ]
        }
      : {})
  };

  const orderBy = ehOrdemConhecida(ordem) ? ORDENACOES[ordem] : ORDENACOES.recentes;

  const take = Math.min(Number(porPagina) || 20, 100);
  const skip = (Math.max(Number(pagina) || 1, 1) - 1) * take;

  const [total, clientes] = await Promise.all([
    prisma.clienteVeterinario.count({ where }),
    prisma.clienteVeterinario.findMany({
      where,
      orderBy,
      take,
      skip,
      include: {
        tutor: {
          select: {
            id: true,
            nome: true,
            email: true,
            telefone: true,
            cidade: true,
            foto_perfil: true,
            pets: { select: { id: true, nome: true, tipo: true, raca: true } }
          }
        }
      }
    })
  ]);

  return {
    total,
    pagina: Math.max(Number(pagina) || 1, 1),
    por_pagina: take,
    clientes: clientes.map((c) => ({
      id: c.id,
      tutor: c.tutor,
      apelido: c.apelido,
      tags: c.tags,
      favorito: c.favorito,
      notas_privadas: c.notas_privadas,
      total_atendimentos: c.total_atendimentos,
      ultimo_atendimento: c.ultimo_atendimento,
      dias_sem_atendimento: c.ultimo_atendimento
        ? Math.floor((Date.now() - new Date(c.ultimo_atendimento).getTime()) / 86400000)
        : null
    }))
  };
}

/**
 * Ficha completa de um cliente: dados do tutor, pets e todos os atendimentos
 * que ESTE veterinário prestou a ele.
 *
 * O escopo dos atendimentos é o par (vet, tutor) de propósito. A ficha
 * comercial é privada; para o histórico clínico compartilhado do tenant o vet
 * usa `GET /solicitacoes/:id/historico-do-pet`, que tem outra autorização.
 */
export async function obterCliente({ tenantId, veterinarioId, tutorId }: ChaveFicha) {
  const ficha = await prisma.clienteVeterinario.findUnique({
    where: {
      veterinario_id_tutor_id: { veterinario_id: veterinarioId, tutor_id: tutorId }
    },
    include: {
      tutor: {
        select: {
          id: true,
          nome: true,
          email: true,
          telefone: true,
          cidade: true,
          foto_perfil: true,
          criado_em: true,
          pets: {
            select: {
              id: true,
              nome: true,
              tipo: true,
              especie: true,
              raca: true,
              idade: true,
              peso: true,
              foto: true
            }
          }
        }
      }
    }
  });

  if (!ficha || ficha.tenant_id !== tenantId) {
    return null;
  }

  const [atendimentos, agendamentos] = await Promise.all([
    prisma.solicitacao.findMany({
      where: { tenant_id: tenantId, veterinario_id: veterinarioId, tutor_id: tutorId },
      orderBy: { criado_em: 'desc' },
      take: 50,
      select: {
        id: true,
        tipo_atendimento: true,
        status: true,
        diagnostico: true,
        criado_em: true,
        finalizado_em: true,
        valor_estimado: true,
        receita_pdf_url: true,
        prontuario_pdf_url: true,
        pet: { select: { id: true, nome: true, tipo: true } },
        // A nota que o TUTOR deu ao veterinário. A direção contrária existe e
        // não entra aqui: o painel do profissional mostra como ele é visto.
        avaliacoes: { where: { autor_papel: 'tutor' }, take: 1, select: { nota: true, comentario: true } }
      }
    }),
    prisma.agendamento.findMany({
      where: {
        tenant_id: tenantId,
        veterinario_id: veterinarioId,
        tutor_id: tutorId,
        status: { in: ['pendente', 'confirmado'] },
        inicio: { gte: new Date() }
      },
      orderBy: { inicio: 'asc' },
      select: {
        id: true,
        inicio: true,
        fim: true,
        tipo_atendimento: true,
        status: true,
        pet: { select: { id: true, nome: true } }
      }
    })
  ]);

  return {
    id: ficha.id,
    tutor: ficha.tutor,
    apelido: ficha.apelido,
    tags: ficha.tags,
    favorito: ficha.favorito,
    notas_privadas: ficha.notas_privadas,
    resumo: {
      total_atendimentos: ficha.total_atendimentos,
      ultimo_atendimento: ficha.ultimo_atendimento,
      cliente_desde: ficha.criado_em,
      avaliacao_media: mediaDasAvaliacoes(atendimentos)
    },
    atendimentos,
    proximos_agendamentos: agendamentos
  };
}

/** Só o recorte de que a média precisa: a primeira nota de cada atendimento. */
interface AtendimentoComNota {
  avaliacoes?: { nota: number }[];
}

function mediaDasAvaliacoes(atendimentos: AtendimentoComNota[]): number | null {
  const notas = atendimentos
    .map((a) => a.avaliacoes?.[0]?.nota)
    .filter((n): n is number => typeof n === 'number');
  if (notas.length === 0) return null;
  return Number((notas.reduce((s, n) => s + n, 0) / notas.length).toFixed(2));
}

/**
 * Atualiza a parte comercial da ficha. Só mexe no que veio no corpo — a ficha
 * é criada na hora se ainda não existir, porque o vet pode querer anotar algo
 * sobre um tutor antes mesmo do primeiro fechamento.
 */
export async function atualizarFicha({
  tenantId,
  veterinarioId,
  tutorId,
  dados
}: ChaveFicha & { dados: DadosDaFicha }) {
  await garantirFicha({ tenantId, veterinarioId, tutorId });

  const permitido: Prisma.ClienteVeterinarioUpdateInput = {};
  if (dados.notas_privadas !== undefined) permitido.notas_privadas = dados.notas_privadas;
  if (dados.apelido !== undefined) permitido.apelido = dados.apelido;
  if (dados.favorito !== undefined) permitido.favorito = Boolean(dados.favorito);
  if (dados.tags !== undefined) {
    // Normaliza para não acabar com "Idoso", "idoso " e "IDOSO" como três tags.
    const vistas = new Set<string>();
    permitido.tags = (Array.isArray(dados.tags) ? dados.tags : [])
      .map((t: unknown) => String(t).trim())
      .filter((t) => t.length > 0 && t.length <= 30)
      .filter((t) => {
        const chave = t.toLowerCase();
        if (vistas.has(chave)) return false;
        vistas.add(chave);
        return true;
      })
      .slice(0, 15);
  }

  return prisma.clienteVeterinario.update({
    where: {
      veterinario_id_tutor_id: { veterinario_id: veterinarioId, tutor_id: tutorId }
    },
    data: permitido
  });
}

/**
 * Todas as tags que o veterinário já usou, para alimentar o autocomplete sem
 * inventar um vocabulário fixo no código.
 */
export async function listarTags({
  tenantId,
  veterinarioId
}: {
  tenantId: string;
  veterinarioId: string;
}): Promise<{ tag: string; total: number }[]> {
  const fichas = await prisma.clienteVeterinario.findMany({
    where: { tenant_id: tenantId, veterinario_id: veterinarioId, NOT: { tags: { isEmpty: true } } },
    select: { tags: true }
  });

  const contagem = new Map<string, number>();
  for (const ficha of fichas) {
    for (const tag of ficha.tags) {
      contagem.set(tag, (contagem.get(tag) || 0) + 1);
    }
  }

  return [...contagem.entries()]
    .map(([tag, total]) => ({ tag, total }))
    .sort((a, b) => b.total - a.total);
}

// Os controllers ainda são `.js` e fazem `require(...)` com destructuring;
// `module.exports` mantém o contrato enquanto eles não migram.
module.exports = {
  garantirFicha,
  recalcularFicha,
  listarClientes,
  obterCliente,
  atualizarFicha,
  listarTags
};
