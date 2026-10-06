import type { StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';
import { notificarTransicao } from './notificacao-atendimento.service';
import { NotFoundError, ConflictError } from '../middleware/error.middleware';

/**
 * Única fonte de verdade das transições de status de um atendimento.
 *
 * Antes, cada endpoint carregava sua própria checagem ad-hoc (`iniciar` aceitava
 * três status, `finalizar` só um, `recusar` outro) e o mapa de transições era
 * consultado só por `atualizarStatus`. Resultado: dava pra pular etapa por uma
 * rota e não por outra, e nenhuma delas registrava quem fez a mudança.
 *
 * Toda mudança de status passa por `transicionar`, que valida contra este mapa,
 * grava a linha do tempo com ator e data/hora, e faz as duas coisas na mesma
 * transação.
 */
const TRANSICOES: Record<string, StatusAtendimento[]> = {
  criado: ['procurando_veterinario', 'sem_veterinario', 'cancelado_tutor', 'cancelado', 'cancelado_admin'],
  procurando_veterinario: [
    'oferta_enviada',
    'veterinario_encontrado',
    'aceito',
    'sem_veterinario',
    'expirado',
    'cancelado_tutor',
    'cancelado',
    'cancelado_admin'
  ],
  oferta_enviada: [
    'veterinario_encontrado',
    'aceito',
    'expirado',
    'recusado',
    'procurando_veterinario',
    'cancelado_tutor',
    'cancelado',
    'cancelado_admin'
  ],
  // `procurando_veterinario` aqui é a recusa: o vet devolve o chamado para a fila.
  veterinario_encontrado: [
    'a_caminho',
    'procurando_veterinario',
    'recusado',
    'cancelado_vet',
    'cancelado_tutor',
    'cancelado',
    'cancelado_admin'
  ],
  // `encaminhado` é a emergência clínica: em qualquer ponto com veterinário
  // envolvido, o caso pode exceder o atendimento domiciliar e o tutor é
  // orientado a buscar um serviço de emergência — com o desfecho registrado.
  aceito: ['a_caminho', 'encaminhado', 'cancelado_vet', 'cancelado_tutor', 'cancelado', 'cancelado_admin'],
  a_caminho: ['chegou', 'encaminhado', 'cancelado_vet', 'cancelado', 'cancelado_admin'],
  chegou: ['atendimento_em_andamento', 'encaminhado', 'cancelado_vet', 'cancelado', 'cancelado_admin'],
  atendimento_em_andamento: ['finalizado', 'concluido', 'encaminhado', 'contestado'],
  // Depois de finalizado o atendimento é imutável, exceto por contestação.
  finalizado: ['contestado'],
  concluido: ['contestado'],
  // `sem_veterinario` deixou de ser terminal: o tutor pode mandar procurar de
  // novo sem repetir pet, sintomas e endereço. Quem o alcança é a varredura de
  // `busca-sem-resposta.service`.
  sem_veterinario: ['procurando_veterinario', 'cancelado_tutor', 'cancelado', 'cancelado_admin'],
  // Estados terminais.
  expirado: [],
  recusado: [],
  cancelado: [],
  cancelado_tutor: [],
  cancelado_vet: [],
  cancelado_admin: [],
  pagamento_falhou: [],
  contestado: [],
  encaminhado: []
};

/** Status a partir dos quais o atendimento ainda pode andar. */
const STATUS_ATIVOS: StatusAtendimento[] = [
  'criado',
  'procurando_veterinario',
  'oferta_enviada',
  'veterinario_encontrado',
  'aceito',
  'a_caminho',
  'chegou',
  'atendimento_em_andamento'
];

/** Status em que o atendimento já foi concluído e o histórico é imutável. */
const STATUS_FINALIZADOS: StatusAtendimento[] = ['finalizado', 'concluido'];

/**
 * Aceita texto solto de propósito: quem pergunta costuma vir de uma request, e
 * status inventado precisa devolver `false` em vez de estourar. A conversão é
 * segura porque `includes` sobre um valor que não existe no mapa dá `false`.
 */
function podeTransicionar(de: string, para: string): boolean {
  return Boolean(TRANSICOES[de]?.includes(para as StatusAtendimento));
}

/**
 * Move um atendimento de status, gravando a linha do tempo no mesmo passo.
 *
 * @param {object}   opts              Tudo vem num objeto só — a lista abaixo são as chaves dele.
 * @param {string}   opts.id           Id do atendimento.
 * @param {string}   opts.tenantId     Tenant do chamador — o atendimento é buscado com escopo nele.
 * @param {string}   opts.para         Status de destino.
 * @param {object}   [opts.ator]       `{ id, tipo }` de quem provocou a mudança. Vazio = sistema.
 * @param {string}   [opts.origem]     api | worker | n8n | admin.
 * @param {string[]} [opts.deveEstarEm] Restringe ainda mais os status de origem aceitos
 *                                      (o endpoint pode ser mais estrito que o mapa, nunca mais frouxo).
 * @param {object}   [opts.dados]      Campos extras a gravar junto do status.
 * @param {string}   [opts.observacao] Texto livre para a linha do tempo.
 * @param {object}   [opts.coordenadas] `{ latitude, longitude }` do momento da mudança.
 * @param {object}   [opts.include]    Include do Prisma para o registro devolvido.
 * @param {Function} [opts.aposTransicao] Roda dentro da mesma transação, depois do update de status
 *                                        e do registro na linha do tempo. Recebe `(tx, atendimentoId)`.
 *                                        É por aqui que o fechamento grava o prontuário: ou o
 *                                        atendimento fecha com registro clínico, ou não fecha.
 * @returns {Promise<object>} O atendimento já atualizado.
 */
type Ator = { id?: string | null; tipo?: string | null };

export type PedidoDeTransicao = {
  id: string;
  tenantId: string;
  para: StatusAtendimento;
  ator?: Ator;
  origem?: string;
  /** Restringe os status de origem aceitos, além do que o mapa já permite. */
  deveEstarEm?: StatusAtendimento[] | null;
  dados?: Record<string, unknown>;
  observacao?: string | null;
  coordenadas?: { latitude?: number | null; longitude?: number | null } | null;
  include?: Record<string, unknown>;
  aposTransicao?: ((tx: any, atendimentoId: string) => Promise<unknown>) | null;
};

async function transicionar({
  id,
  tenantId,
  para,
  ator = {},
  origem = 'api',
  deveEstarEm = null,
  dados = {},
  observacao = null,
  coordenadas = null,
  include = undefined,
  aposTransicao = null
}: PedidoDeTransicao): Promise<any> {
  const atual = await prisma.solicitacao.findFirst({
    where: { id, tenant_id: tenantId },
    select: { id: true, status: true, tenant_id: true }
  });

  if (!atual) {
    throw new NotFoundError('Solicitação não encontrada');
  }

  if (deveEstarEm && !deveEstarEm.includes(atual.status)) {
    throw new ConflictError(`Atendimento não pode ir para "${para}" a partir de "${atual.status}"`);
  }

  if (!podeTransicionar(atual.status, para)) {
    throw new ConflictError(`Transição de status inválida: "${atual.status}" → "${para}"`);
  }

  const resultado = await prisma.$transaction(async (tx) => {
    // Guarda otimista: o update só passa se o status ainda for o que lemos acima.
    // Sem isso, dois veterinários aceitando ao mesmo tempo sobrescrevem um ao outro.
    const alterados = await tx.solicitacao.updateMany({
      where: { id, tenant_id: tenantId, status: atual.status },
      data: { ...dados, status: para }
    });

    if (alterados.count !== 1) {
      throw new ConflictError('O atendimento mudou de status durante a operação. Recarregue e tente de novo.');
    }

    await tx.solicitacaoTimeline.create({
      data: {
        tenant_id: atual.tenant_id,
        atendimento_id: id,
        status: para,
        status_anterior: atual.status,
        ator_id: ator.id || null,
        ator_tipo: ator.tipo || 'sistema',
        origem,
        latitude: coordenadas?.latitude ?? null,
        longitude: coordenadas?.longitude ?? null,
        observacao
      }
    });

    if (aposTransicao) {
      await aposTransicao(tx, id);
    }

    return tx.solicitacao.findFirst({ where: { id, tenant_id: tenantId }, include });
  });

  // Push fora da transação: notificação é melhor esforço e I/O externo —
  // nunca pode segurar nem derrubar a mudança de status.
  notificarTransicao({ id, tenantId, para }).catch((error) => {
    console.error('⚠️  Push da transição não enviado:', error.message);
  });

  return resultado;
}

// Mensagens por status, na voz de quem recebe. A spec do orquestrador pede
// notificação relevante para as duas pontas em toda mudança; o que não está
// Quem é avisado, de quê e por qual canal virou tabela em
// `notificacao-atendimento.service`, consumida daqui. Antes o mapa vivia neste
// arquivo e só sabia push; a matriz cobre push e e-mail, os dois papéis, e é
// travada por um teste que falha se um status novo entrar mudo.

/** Extrai `{ id, tipo }` do ator a partir da request autenticada. */
function atorDaRequest(req: { userId?: string | null; userType?: string | null }): Ator {
  return { id: req.userId || null, tipo: req.userType || null };
}

export {
  TRANSICOES,
  STATUS_ATIVOS,
  STATUS_FINALIZADOS,
  podeTransicionar,
  transicionar,
  atorDaRequest
};
