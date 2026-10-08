import { fusoDeExibicao } from '../utils/datas';
import type { Prisma, TipoAtendimento } from '@prisma/client';
import prisma from '../config/database';
import * as pushService from './push.service';

const emailService = require('./email.service');

/**
 * Aviso por e-mail dos eventos de agendamento.
 *
 * Criação, cancelamento e remarcação aconteciam em silêncio: o vet marcava e o
 * tutor só ficava sabendo por fora (`ROADMAP`, "Em aberto no CRM"). Aqui a
 * regra é avisar sempre a OUTRA parte — quem agiu não precisa de e-mail sobre
 * o próprio clique.
 *
 * Tudo é best-effort por decisão: falha de e-mail não pode desfazer nem travar
 * o agendamento, que já está gravado. Quem chama usa `.catch()` ou confia no
 * try/catch interno — nenhum destes métodos lança.
 */

const formatarDataHora = (data: Date | string | number): string =>
  new Date(data).toLocaleString('pt-BR', {
    timeZone: fusoDeExibicao(),
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  });

const TIPO_LABEL: Partial<Record<TipoAtendimento, string>> = {
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleconsulta'
};

/** O agendamento com tudo que os e-mails precisam (nomes e e-mails das duas pontas). */
type AgendamentoCompleto = Prisma.AgendamentoGetPayload<{
  include: {
    pet: { select: { nome: true } };
    tutor: { select: { id: true; nome: true; email: true } };
    veterinario: { select: { usuario: { select: { id: true; nome: true; email: true } } } };
  };
}>;

interface DadosBase {
  nomeTutor: string;
  nomeVet: string;
  nomePet: string;
  dataHora: string;
  tipoConsulta: string;
}

export interface MudancaDeStatus {
  novoStatus: string;
  /** Id de `Usuario` de quem fez a mudança. */
  atorId?: string | null;
  motivo?: string | null;
}

/**
 * Recarrega o agendamento com tudo que os e-mails precisam (nomes e e-mails
 * das duas pontas). Os retornos dos services trazem includes variados — buscar
 * de novo aqui é mais barato que exigir o mesmo shape de todo chamador.
 */
async function carregarCompleto(agendamentoId: string): Promise<AgendamentoCompleto | null> {
  return prisma.agendamento.findUnique({
    where: { id: agendamentoId },
    include: {
      pet: { select: { nome: true } },
      tutor: { select: { id: true, nome: true, email: true } },
      veterinario: {
        select: { usuario: { select: { id: true, nome: true, email: true } } }
      }
    }
  });
}

function dadosBase(agendamento: AgendamentoCompleto): DadosBase {
  return {
    nomeTutor: agendamento.tutor?.nome || 'Tutor',
    nomeVet: agendamento.veterinario?.usuario?.nome
      ? `Dr(a). ${agendamento.veterinario.usuario.nome}`
      : 'veterinário responsável',
    nomePet: agendamento.pet?.nome || 'seu pet',
    dataHora: formatarDataHora(agendamento.inicio),
    tipoConsulta: TIPO_LABEL[agendamento.tipo_atendimento] || 'Atendimento'
  };
}

/** Vet marcou uma consulta → avisa o tutor. */
async function notificarCriacao(agendamentoId: string): Promise<boolean> {
  try {
    const agendamento = await carregarCompleto(agendamentoId);
    if (!agendamento?.tutor?.email) return false;

    const base = dadosBase(agendamento);
    await emailService.enviarEmailAgendamentoTutor(agendamento.tutor.email, {
      evento: 'marcado',
      ...base
    });
    // Push cobre quem está com o app fechado — mesmo destinatário do e-mail.
    void pushService.enviarParaUsuario(agendamento.tutor.id, {
      title: 'Consulta marcada 📅',
      body: `${base.nomeVet} marcou ${base.tipoConsulta.toLowerCase()} para ${base.nomePet}: ${base.dataHora}.`,
      url: '/tutor/agenda',
      tag: `agendamento-${agendamentoId}`
    });
    return true;
  } catch (erro) {
    console.error(`⚠️  [AGENDAMENTO] Falha ao avisar criação de ${agendamentoId} (ignorado):`, (erro as Error).message);
    return false;
  }
}

/** Consulta remarcada → avisa o tutor do novo horário. */
async function notificarRemarcacao(agendamentoId: string): Promise<boolean> {
  try {
    const agendamento = await carregarCompleto(agendamentoId);
    if (!agendamento?.tutor?.email) return false;

    const base = dadosBase(agendamento);
    await emailService.enviarEmailAgendamentoTutor(agendamento.tutor.email, {
      evento: 'remarcado',
      ...base
    });
    void pushService.enviarParaUsuario(agendamento.tutor.id, {
      title: 'Consulta remarcada',
      body: `A consulta de ${base.nomePet} mudou para ${base.dataHora}.`,
      url: '/tutor/agenda',
      tag: `agendamento-${agendamentoId}`
    });
    return true;
  } catch (erro) {
    console.error(`⚠️  [AGENDAMENTO] Falha ao avisar remarcação de ${agendamentoId} (ignorado):`, (erro as Error).message);
    return false;
  }
}

/**
 * Mudança de status → avisa a outra parte.
 *
 * `atorId` é quem fez a mudança (id de `Usuario`). Se foi o tutor, o aviso vai
 * para o vet; qualquer outro ator (vet, admin) avisa o tutor. Só cancelamento
 * e confirmação geram e-mail — `concluido`/`nao_compareceu` são registro
 * interno do vet, não notícia para ninguém.
 */
async function notificarMudancaDeStatus(
  agendamentoId: string,
  { novoStatus, atorId, motivo }: MudancaDeStatus
): Promise<boolean> {
  if (!['cancelado', 'confirmado'].includes(novoStatus)) return false;

  try {
    const agendamento = await carregarCompleto(agendamentoId);
    if (!agendamento) return false;

    const base = { ...dadosBase(agendamento), motivo: motivo || undefined };
    const atorEhTutor = atorId === agendamento.tutor?.id;

    if (atorEhTutor) {
      const emailVet = agendamento.veterinario?.usuario?.email;
      if (!emailVet) return false;
      await emailService.enviarEmailAgendamentoVet(emailVet, {
        evento: novoStatus,
        ...base,
        nomeVet: agendamento.veterinario.usuario.nome || 'Veterinário'
      });
      void pushService.enviarParaUsuario(agendamento.veterinario.usuario.id, {
        title: novoStatus === 'cancelado' ? 'Consulta cancelada pelo tutor' : 'Consulta confirmada pelo tutor',
        body: `${base.nomeTutor} ${novoStatus === 'cancelado' ? 'cancelou' : 'confirmou'} a consulta de ${base.nomePet} (${base.dataHora}).`,
        url: '/veterinario/agendamentos',
        tag: `agendamento-${agendamentoId}`
      });
      return true;
    }

    // Confirmação do próprio vet não é notícia para o tutor — ele já foi
    // avisado da criação. Só o cancelamento muda o plano dele.
    if (novoStatus !== 'cancelado') return false;
    if (!agendamento.tutor?.email) return false;

    await emailService.enviarEmailAgendamentoTutor(agendamento.tutor.email, {
      evento: 'cancelado',
      ...base
    });
    void pushService.enviarParaUsuario(agendamento.tutor.id, {
      title: 'Consulta cancelada',
      body: `A consulta de ${base.nomePet} (${base.dataHora}) foi cancelada.`,
      url: '/tutor/agenda',
      tag: `agendamento-${agendamentoId}`
    });
    return true;
  } catch (erro) {
    console.error(`⚠️  [AGENDAMENTO] Falha ao avisar status de ${agendamentoId} (ignorado):`, (erro as Error).message);
    return false;
  }
}

export {
  notificarCriacao,
  notificarRemarcacao,
  notificarMudancaDeStatus,
  formatarDataHora
};
