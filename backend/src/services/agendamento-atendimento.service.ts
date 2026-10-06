import type { Prisma, StatusAgendamento } from '@prisma/client';
import prisma from '../config/database';
import { NotFoundError, ConflictError } from '../middleware/error.middleware';
import { STATUS_ATIVOS } from './atendimento-state.service';

/**
 * A ponte entre a agenda e o prontuário.
 *
 * `Agendamento.solicitacao_id` existia desde a criação da agenda com o
 * comentário "preenchido quando o agendamento vira atendimento de verdade" —
 * e ninguém o preenchia. Consulta marcada e atendimento registrado eram dois
 * mundos: o veterinário marcava a consulta na agenda, atendia, e depois
 * precisava abrir um chamado do zero para conseguir fechar com prontuário,
 * receita e cobrança. Concluir o agendamento era um clique manual que não
 * gerava registro clínico nenhum.
 *
 * Agora o agendamento nasce atendimento na hora marcada: pelo worker, quando
 * o horário chega, ou pelo botão do veterinário, quando ele começa antes.
 */

// Só estes viram atendimento sozinhos. `pendente` (tutor ainda não confirmou)
// só entra pelo caminho manual, quando o veterinário está de fato lá.
const STATUS_AUTOMATICO: StatusAgendamento[] = ['confirmado'];
const STATUS_MANUAL: StatusAgendamento[] = ['pendente', 'confirmado'];

/** O recorte do cadastro do tutor de que o endereço de texto precisa. */
export interface EnderecoDoTutor {
  endereco?: string | null;
  numero?: string | null;
  cidade?: string | null;
}

/** Endereço do atendimento a partir do cadastro do tutor, quando houver. */
function enderecoDoTutor(tutor: EnderecoDoTutor | null | undefined): string | null {
  if (!tutor) return null;
  const partes = [tutor.endereco, tutor.numero].filter(Boolean).join(', ');
  const local = [partes, tutor.cidade].filter(Boolean).join(' — ');
  return local || null;
}

/** Quem provocou a abertura: `{ id, tipo }`; o worker passa só `tipo: 'sistema'`. */
export interface AtorDaAbertura {
  id?: string | null;
  tipo?: string | null;
}

export interface PedidoDeAbertura {
  agendamentoId: string;
  tenantId: string;
  /** `{ id, tipo }` de quem provocou. */
  ator?: AtorDaAbertura;
  /** 'api' | 'worker' */
  origem?: string;
  /** true aceita agendamento ainda pendente. */
  manual?: boolean;
}

/** O atendimento como sai daqui: com pet e o recorte do tutor que a tela usa. */
export type SolicitacaoAberta = Prisma.SolicitacaoGetPayload<{
  include: {
    pet: true;
    tutor: { select: { id: true; nome: true; telefone: true; cidade: true } };
  };
}>;

export interface ResultadoDaAbertura {
  solicitacao: SolicitacaoAberta;
  reaproveitada: boolean;
}

/**
 * Abre o atendimento de um agendamento, de forma idempotente.
 */
async function abrirAtendimentoDoAgendamento({
  agendamentoId,
  tenantId,
  ator = { tipo: 'sistema' },
  origem = 'worker',
  manual = false
}: PedidoDeAbertura): Promise<ResultadoDaAbertura> {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: agendamentoId, tenant_id: tenantId },
    include: {
      pet: { select: { id: true, nome: true } },
      tutor: { select: { id: true, nome: true, endereco: true, numero: true, cidade: true } },
      veterinario: { select: { id: true, usuario_id: true } }
    }
  });

  if (!agendamento) {
    throw new NotFoundError('Agendamento não encontrado');
  }

  // Idempotência: chamar duas vezes (worker + botão, por exemplo) devolve o
  // mesmo atendimento em vez de abrir um segundo para a mesma consulta.
  if (agendamento.solicitacao_id) {
    const existente = await prisma.solicitacao.findUnique({
      where: { id: agendamento.solicitacao_id },
      include: { pet: true, tutor: { select: { id: true, nome: true, telefone: true, cidade: true } } }
    });
    if (existente) return { solicitacao: existente, reaproveitada: true };
  }

  const permitidos = manual ? STATUS_MANUAL : STATUS_AUTOMATICO;
  if (!permitidos.includes(agendamento.status)) {
    throw new ConflictError(
      agendamento.status === 'pendente'
        ? 'Esta consulta ainda aguarda confirmação do tutor.'
        : `Consulta ${agendamento.status} não vira atendimento.`
    );
  }

  // A regra de um atendimento ativo por tutor vale aqui também: abrir um
  // segundo deixaria o tutor com dois chamados abertos ao mesmo tempo.
  const ativo = await prisma.solicitacao.findFirst({
    where: { tenant_id: tenantId, tutor_id: agendamento.tutor_id, status: { in: STATUS_ATIVOS } },
    select: { id: true }
  });
  if (ativo) {
    throw new ConflictError('O tutor já possui um atendimento em andamento.');
  }

  // Endereço com coordenada, quando o tutor tem um salvo.
  //
  // O atendimento aberto a partir de uma consulta agendada nascia SEM
  // latitude/longitude, com o endereço montado dos campos de texto do perfil.
  // Como ele já nasce aceito, o despacho por proximidade não faz falta — mas o
  // mapa faz: o veterinário não via para onde ir e o tutor não via ninguém se
  // aproximando. Justamente na consulta marcada, em que dá tempo de tudo estar
  // certo.
  let enderecoSalvo: {
    endereco: string;
    complemento: string | null;
    latitude: number | null;
    longitude: number | null;
  } | null = null;
  try {
    enderecoSalvo = await prisma.enderecoTutor.findFirst({
      where: { tutor_id: agendamento.tutor_id, tenant_id: tenantId },
      orderBy: [{ principal: 'desc' }, { usado_em: 'desc' }],
      select: { endereco: true, complemento: true, latitude: true, longitude: true }
    });
  } catch {
    // Sem endereço salvo o atendimento ainda abre, com o endereço de texto do
    // perfil: a consulta marcada não pode falhar por causa do mapa.
  }

  const localDoAtendimento = enderecoSalvo?.latitude != null
    ? {
        localizacao_cliente: [enderecoSalvo.endereco, enderecoSalvo.complemento].filter(Boolean).join(' — '),
        latitude: enderecoSalvo.latitude,
        longitude: enderecoSalvo.longitude
      }
    : { localizacao_cliente: enderecoDoTutor(agendamento.tutor), latitude: null, longitude: null };

  const solicitacao = await prisma.$transaction(async (tx) => {
    const criada = await tx.solicitacao.create({
      data: {
        tenant_id: tenantId,
        tutor_id: agendamento.tutor_id,
        pet_id: agendamento.pet_id,
        veterinario_id: agendamento.veterinario_id,
        tipo_atendimento: agendamento.tipo_atendimento,
        // Nasce já aceito: a consulta tem dono e hora desde que foi marcada,
        // não passa pela fila aberta de plantão.
        status: 'aceito',
        localizacao_cliente: localDoAtendimento.localizacao_cliente,
        latitude: localDoAtendimento.latitude,
        longitude: localDoAtendimento.longitude,
        observacoes: agendamento.observacoes || null,
        valor_estimado: agendamento.valor_estimado == null ? null : Number(agendamento.valor_estimado)
      },
      include: {
        pet: true,
        tutor: { select: { id: true, nome: true, telefone: true, cidade: true } }
      }
    });

    await tx.solicitacaoTimeline.create({
      data: {
        tenant_id: tenantId,
        atendimento_id: criada.id,
        status: 'aceito',
        ator_id: ator.id || null,
        ator_tipo: ator.tipo || 'sistema',
        origem,
        observacao: `Aberto a partir da consulta agendada para ${agendamento.inicio.toISOString()}`
      }
    });

    await tx.agendamento.update({
      where: { id: agendamento.id },
      data: { solicitacao_id: criada.id, status: 'confirmado' }
    });

    return criada;
  });

  // Aviso ao tutor em melhor esforço: falhar aqui não desfaz o atendimento.
  try {
    const pushService = require('./push.service') as typeof import('./push.service');
    void pushService.enviarParaUsuario(agendamento.tutor_id, {
      title: '🩺 Seu atendimento começou',
      body: `A consulta de ${agendamento.pet?.nome || 'seu pet'} foi aberta — acompanhe pelo app.`,
      url: `/tutor/acompanhar/${solicitacao.id}`,
      tag: `atendimento-${solicitacao.id}`
    });
  } catch (erro) {
    console.error('⚠️  [AGENDA→ATENDIMENTO] Push do tutor falhou (ignorado):', (erro as Error).message);
  }

  return { solicitacao, reaproveitada: false };
}

export {
  abrirAtendimentoDoAgendamento,
  enderecoDoTutor,
  STATUS_AUTOMATICO,
  STATUS_MANUAL
};
