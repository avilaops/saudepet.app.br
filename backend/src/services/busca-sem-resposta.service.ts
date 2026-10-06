import type { StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';
import { transicionar, STATUS_ATIVOS } from './atendimento-state.service';
import { ConflictError, ForbiddenError, NotFoundError } from '../middleware/error.middleware';

/**
 * A busca que não termina.
 *
 * O estado `sem_veterinario` estava declarado na máquina de estados, era
 * terminal, tinha até mensagem de push escrita — e NADA no sistema
 * transicionava para ele. Sem plantonista, a solicitação ficava em
 * `procurando_veterinario` para sempre: três da manhã, o animal passando mal, e
 * a tela girando indefinidamente sem ninguém dizer que não vem.
 *
 * O vigia de SLA (`sla-atendimento.worker`) já avisava a EQUIPE por e-mail
 * quando um chamado passava do prazo. O que faltava era a outra ponta — contar
 * ao tutor, e devolver a ele alguma saída.
 *
 * Aqui estão as duas: a varredura que encerra a busca e avisa, e o caminho de
 * volta para quem quiser tentar de novo sem repetir pet, sintomas e endereço.
 */

/**
 * Quanto tempo esperamos antes de admitir que não há ninguém.
 *
 * É o dobro do prazo em que a equipe é alertada (`MINUTOS_SLA`): o alerta
 * interno serve para alguém tentar resolver na mão, e desistir na cara do tutor
 * enquanto essa tentativa está em curso seria precipitado. Emergência tem o
 * prazo mais curto porque é onde a espera custa caro — mas mesmo ali, vinte
 * minutos são vinte minutos, e é melhor uma resposta ruim do que nenhuma.
 */
const MINUTOS_ATE_DESISTIR: Record<string, number> = {
  emergencia: 20,
  teleorientacao: 40,
  consulta_domiciliar: 60,
  // Preventivos esperam mais: quem marca vacinação não está com o animal
  // passando mal, e encerrar a busca cedo demais só cria um pedido a refazer.
  avaliacao: 90,
  vacinacao: 180,
  consulta_rotina: 180
};
const MINUTOS_PADRAO = 45;

/** Status em que o chamado ainda espera alguém aceitar. */
const AGUARDANDO_ACEITE: StatusAtendimento[] = ['criado', 'procurando_veterinario', 'oferta_enviada'];

const INTERVALO_PADRAO_MS = 2 * 60 * 1000;

type Candidato = {
  id: string;
  tenant_id: string;
  tipo_atendimento: string | null;
  criado_em: Date;
};

export type ResultadoDaVarredura = {
  verificados: number;
  encerrados: number;
};

function minutosDeEspera(criadoEm: Date): number {
  return Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000);
}

function prazoDe(tipo: string | null): number {
  if (!tipo) return MINUTOS_PADRAO;
  return MINUTOS_ATE_DESISTIR[tipo] ?? MINUTOS_PADRAO;
}

/**
 * Encerra as buscas que passaram do prazo.
 *
 * A transição em si dispara o push para o tutor — a mensagem
 * ("Nenhum veterinário disponível") já existia no mapa da máquina de estados,
 * esperando alguém que a fizesse acontecer.
 */
export async function encerrarBuscasSemResposta(): Promise<ResultadoDaVarredura> {
  const menorPrazo = Math.min(...Object.values(MINUTOS_ATE_DESISTIR), MINUTOS_PADRAO);

  const candidatos: Candidato[] = await prisma.solicitacao.findMany({
    where: {
      status: { in: AGUARDANDO_ACEITE },
      criado_em: { lte: new Date(Date.now() - menorPrazo * 60 * 1000) }
    },
    select: { id: true, tenant_id: true, tipo_atendimento: true, criado_em: true },
    // Teto por ciclo: uma fila represada não pode virar uma rajada de push.
    take: 100
  });

  let encerrados = 0;

  for (const candidato of candidatos) {
    const prazo = prazoDe(candidato.tipo_atendimento);
    const espera = minutosDeEspera(candidato.criado_em);
    if (espera < prazo) continue;

    try {
      await transicionar({
        id: candidato.id,
        tenantId: candidato.tenant_id,
        para: 'sem_veterinario',
        ator: { id: null, tipo: 'sistema' },
        origem: 'worker',
        // Guarda contra corrida: se um veterinário aceitou entre a leitura e
        // agora, a transição é recusada e o atendimento segue em frente.
        deveEstarEm: AGUARDANDO_ACEITE,
        observacao: `Nenhum veterinário aceitou em ${espera} minutos (prazo de ${prazo}).`
      });
      encerrados += 1;
    } catch (erro) {
      // Corrida perdida ou transição inválida: não é falha do ciclo.
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(`⚠️  [Busca] Não encerrei ${candidato.id} (ignorado):`, mensagem);
    }
  }

  return { verificados: candidatos.length, encerrados };
}

/**
 * Procurar de novo, sem recomeçar do zero.
 *
 * Recriar a solicitação faria o tutor responder outra vez qual pet, quais
 * sintomas e onde ele está — no momento em que ele está menos disposto a isso.
 * O chamado volta para a fila com tudo que já foi dito.
 */
export async function retomarBusca({
  solicitacaoId,
  tenantId,
  tutorId,
  io = null
}: {
  solicitacaoId: string;
  tenantId: string;
  tutorId: string;
  io?: { to: (sala: string) => { emit: (evento: string, dados: unknown) => void } } | null;
}) {
  const solicitacao = await prisma.solicitacao.findFirst({
    where: { id: solicitacaoId, tenant_id: tenantId },
    select: { id: true, status: true, tutor_id: true }
  });

  if (!solicitacao) {
    throw new NotFoundError('Solicitação não encontrada');
  }
  if (solicitacao.tutor_id !== tutorId) {
    throw new ForbiddenError('Esta solicitação não é sua');
  }
  if (solicitacao.status !== 'sem_veterinario') {
    throw new ConflictError('Esta busca não está encerrada');
  }

  // A mesma regra da criação: um atendimento ativo por tutor. Sem isto, quem
  // pediu de novo enquanto o antigo dormia acabaria com dois na rua.
  const jaTemAtivo = await prisma.solicitacao.findFirst({
    where: {
      tenant_id: tenantId,
      tutor_id: tutorId,
      status: { in: STATUS_ATIVOS },
      id: { not: solicitacaoId }
    },
    select: { id: true }
  });
  if (jaTemAtivo) {
    throw new ConflictError('Você já possui um atendimento em andamento');
  }

  const atualizada = await transicionar({
    id: solicitacaoId,
    tenantId,
    para: 'procurando_veterinario',
    ator: { id: tutorId, tipo: 'tutor' },
    deveEstarEm: ['sem_veterinario'],
    observacao: 'O tutor pediu para procurar de novo.',
    include: { pet: true }
  });

  // Os plantonistas precisam ver o chamado voltar — é o mesmo aviso que o
  // sistema dá quando um veterinário devolve a solicitação para a fila.
  io?.to(`tenant:${tenantId}:veterinarios`).emit('solicitacao:nova', atualizada);

  return atualizada;
}

/** Liga a varredura periódica. */
export function iniciarWorkerDeBusca(intervaloMs: number = INTERVALO_PADRAO_MS) {
  const ciclo = () => {
    encerrarBuscasSemResposta().catch((erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [Busca] Ciclo falhou (ignorado):', mensagem);
    });
  };

  ciclo();
  const timer = setInterval(ciclo, intervaloMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏱️  Worker de busca sem resposta ativo (a cada ${Math.round(intervaloMs / 60000)} min)`);
  return timer;
}

export { MINUTOS_ATE_DESISTIR, MINUTOS_PADRAO, AGUARDANDO_ACEITE };
