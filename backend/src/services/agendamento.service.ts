import { diaPedido, instanteDoRelogio, relogioDeParede } from '../utils/datas';
import type { StatusAgendamento } from '@prisma/client';
import prisma from '../config/database';
import { ValidationError, NotFoundError } from '../middleware/error.middleware';

/**
 * Consulta marcada para data futura.
 *
 * Convive com `Solicitacao` sem se confundir com ela: a solicitação é o chamado
 * imediato ("primeiro vet que aceitar"), o agendamento já nasce com dono e vira
 * atendimento só quando a hora chega.
 */

// Estados que ocupam a agenda do veterinário. `cancelado` e `nao_compareceu`
// liberam o horário; `concluido` também, porque já virou atendimento.
export const STATUS_QUE_OCUPAM: StatusAgendamento[] = ['pendente', 'confirmado'];

export const DURACAO_PADRAO_MIN = 60;

/** 15 min e o menor encaixe util; 8 h e o teto de um turno inteiro. */
const DURACAO_MINIMA_MIN = 15;
const DURACAO_MAXIMA_MIN = 480;

const MINUTO_EM_MS = 60_000;
const DIA_EM_MS = 86_400_000;

type Intervalo = { inicio: Date; fim: Date };
type Transacao = any;

/** Duracao pedida, presa entre o minimo e o maximo aceitos. */
function duracaoValida(pedida?: number | string | null): number {
  const numero = Number(pedida) || DURACAO_PADRAO_MIN;
  return Math.min(Math.max(numero, DURACAO_MINIMA_MIN), DURACAO_MAXIMA_MIN);
}

/** "08:30" vira 510. Comparar minutos evita fuso e horario de verao. */
function emMinutos(hora: string): number {
  const [h, m] = hora.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Um agendamento conflita com outro quando os intervalos se sobrepõem.
 *
 * A comparação é `inicio < fimNovo AND fim > inicioNovo`: encostar não é
 * conflito (terminar 10h e começar 10h é uma agenda cheia, não um choque),
 * mas qualquer sobreposição real é.
 */
export async function encontrarConflito(
  { tenantId, veterinarioId, inicio, fim, ignorarId }:
    Intervalo & { tenantId: string; veterinarioId: string; ignorarId?: string },
  tx: Transacao = prisma
) {
  return tx.agendamento.findFirst({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      status: { in: STATUS_QUE_OCUPAM },
      inicio: { lt: fim },
      fim: { gt: inicio },
      ...(ignorarId ? { NOT: { id: ignorarId } } : {})
    },
    select: { id: true, inicio: true, fim: true }
  });
}

/**
 * Confere se o horário cabe na grade semanal que o vet declarou.
 *
 * A grade guarda "08:00" como texto e um dia da semana; aqui isso vira minutos
 * desde a meia-noite para comparar com o horário pedido. Vet sem nenhuma grade
 * cadastrada aceita qualquer horário — bloquear seria pior, porque a grade é
 * opcional e ninguém preencheu até agora.
 */
export async function dentroDaGrade(
  { tenantId, veterinarioId, inicio, fim }: Intervalo & { tenantId: string; veterinarioId: string },
  tx: Transacao = prisma
): Promise<boolean> {
  // A grade é o relógio do veterinário ("09:00" de Brasília), não o do
  // servidor, que roda em UTC.
  const comeca = relogioDeParede(inicio);
  const termina = relogioDeParede(fim);

  const grade = await tx.agendaDisponivel.findMany({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      dia_semana: comeca.diaDaSemana,
      ativo: true
    }
  });

  if (grade.length === 0) return true;

  const minutosInicio = comeca.minutos;
  // Consulta que atravessa a meia-noite termina "depois" do fim de qualquer faixa.
  const minutosFim = termina.dia === comeca.dia ? termina.minutos : termina.minutos + 24 * 60;

  return grade.some(
    (faixa: { hora_inicio: string; hora_fim: string }) =>
      minutosInicio >= emMinutos(faixa.hora_inicio) && minutosFim <= emMinutos(faixa.hora_fim)
  );
}

/**
 * Cria o agendamento. Serve tanto para o tutor marcar quanto para o vet
 * encaixar alguém — quem chamou define `criadoPorId` e o status inicial.
 */
export async function criar({
  tenantId,
  veterinarioId,
  tutorId,
  petId,
  inicio,
  duracaoMinutos = DURACAO_PADRAO_MIN,
  tipoAtendimento,
  observacoes,
  valorEstimado,
  precoCatalogoCodigo,
  criadoPorId,
  confirmadoDeCara = false
}: {
  tenantId: string;
  veterinarioId: string;
  tutorId: string;
  petId: string;
  inicio: string | Date;
  duracaoMinutos?: number;
  tipoAtendimento?: string | null;
  observacoes?: string | null;
  valorEstimado?: number | null;
  precoCatalogoCodigo?: string | null;
  criadoPorId?: string | null;
  confirmadoDeCara?: boolean;
}) {
  const dataInicio = new Date(inicio);
  if (Number.isNaN(dataInicio.getTime())) {
    throw new ValidationError('Data do agendamento inválida.');
  }

  if (dataInicio.getTime() < Date.now()) {
    throw new ValidationError('Não é possível agendar para uma data que já passou.');
  }

  const duracao = duracaoValida(duracaoMinutos);
  const dataFim = new Date(dataInicio.getTime() + duracao * MINUTO_EM_MS);

  // O pet precisa ser do tutor: sem esta checagem dava para marcar consulta
  // com o animal de outra pessoa passando o id na mão.
  const pet = await prisma.pet.findFirst({
    where: { id: petId, tutor_id: tutorId, tenant_id: tenantId },
    select: { id: true }
  });
  if (!pet) {
    throw new NotFoundError('Pet não encontrado para este tutor.');
  }

  const veterinario = await prisma.veterinario.findFirst({
    where: { id: veterinarioId, tenant_id: tenantId },
    select: { id: true, aprovado_admin: true }
  });
  if (!veterinario) {
    throw new NotFoundError('Veterinário não encontrado.');
  }
  if (!veterinario.aprovado_admin) {
    throw new ValidationError('Este veterinário ainda não está habilitado para atender.');
  }

  if (!(await dentroDaGrade({ tenantId, veterinarioId, inicio: dataInicio, fim: dataFim }))) {
    throw new ValidationError('O veterinário não atende nesse horário.');
  }

  // A checagem de conflito e a criação vão na mesma transação: entre "não tem
  // conflito" e "criado" cabe outro agendamento chegando pelo mesmo horário.
  return prisma.$transaction(async (tx: Transacao) => {
    const conflito = await encontrarConflito(
      { tenantId, veterinarioId, inicio: dataInicio, fim: dataFim },
      tx
    );
    if (conflito) {
      throw new ValidationError('Esse horário já está ocupado na agenda do veterinário.');
    }

    return tx.agendamento.create({
      data: {
        tenant_id: tenantId,
        veterinario_id: veterinarioId,
        tutor_id: tutorId,
        pet_id: petId,
        inicio: dataInicio,
        fim: dataFim,
        tipo_atendimento: tipoAtendimento,
        status: confirmadoDeCara ? 'confirmado' : 'pendente',
        observacoes: observacoes || null,
        valor_estimado: valorEstimado ?? null,
        preco_catalogo_codigo: precoCatalogoCodigo || null,
        criado_por_id: criadoPorId
      },
      include: {
        pet: { select: { id: true, nome: true, tipo: true } },
        tutor: { select: { id: true, nome: true, telefone: true, email: true } }
      }
    });
  });
}

/**
 * Agenda do veterinário num intervalo. É o que a tela de agenda consome.
 */
export async function listarDoVeterinario({ tenantId, veterinarioId, de, ate, status }: {
  tenantId: string;
  veterinarioId: string;
  de?: string | Date | null;
  ate?: string | Date | null;
  status?: StatusAgendamento | null;
}) {
  const inicio = de ? new Date(de) : new Date();
  // Sem `ate`, trinta dias a frente: a tela de agenda mostra um mes.
  const fim = ate ? new Date(ate) : new Date(inicio.getTime() + 30 * DIA_EM_MS);

  return prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      inicio: { gte: inicio, lte: fim },
      ...(status ? { status } : {})
    },
    orderBy: { inicio: 'asc' },
    include: {
      pet: { select: { id: true, nome: true, tipo: true, raca: true } },
      tutor: { select: { id: true, nome: true, telefone: true, foto_perfil: true } }
    }
  });
}

export async function listarDoTutor({ tenantId, tutorId, incluirPassados = false }: {
  tenantId: string;
  tutorId: string;
  incluirPassados?: boolean;
}) {
  return prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      tutor_id: tutorId,
      ...(incluirPassados ? {} : { inicio: { gte: new Date() } })
    },
    orderBy: { inicio: incluirPassados ? 'desc' : 'asc' },
    take: 100,
    include: {
      pet: { select: { id: true, nome: true, tipo: true } },
      veterinario: {
        select: {
          id: true,
          especialidade: true,
          usuario: { select: { nome: true, foto_perfil: true } }
        }
      }
    }
  });
}

/**
 * Muda o status. Cancelar exige motivo de quem cancelou, e o registro guarda
 * quem foi — cancelamento é o dado que mais gera disputa depois.
 */
export async function alterarStatus({ tenantId, agendamentoId, veterinarioId, novoStatus, usuarioId, motivo }: {
  tenantId: string;
  agendamentoId: string;
  /**
   * Quando quem pede é o veterinário, o agendamento tem de ser DELE. Sem isto
   * bastava conhecer o id para confirmar, cancelar ou dar falta na consulta de
   * um colega do mesmo tenant (até 08/10/2026 era assim).
   */
  veterinarioId?: string;
  novoStatus: StatusAgendamento;
  usuarioId?: string | null;
  motivo?: string | null;
}) {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: agendamentoId, tenant_id: tenantId, ...(veterinarioId ? { veterinario_id: veterinarioId } : {}) }
  });

  if (!agendamento) {
    throw new NotFoundError('Agendamento não encontrado.');
  }

  // Os tres estados finais tem lista vazia de proposito: agendamento
  // concluido, cancelado ou com falta e registro, nao rascunho. Reabrir
  // seria reescrever o passado — o caminho certo e criar outro.
  const permitidas: Record<string, StatusAgendamento[]> = {
    pendente: ['confirmado', 'cancelado'],
    confirmado: ['cancelado', 'concluido', 'nao_compareceu'],
    cancelado: [],
    concluido: [],
    nao_compareceu: []
  };

  if (!permitidas[agendamento.status]?.includes(novoStatus)) {
    throw new ValidationError(
      `Não é possível mudar de "${agendamento.status}" para "${novoStatus}".`
    );
  }

  return prisma.agendamento.update({
    where: { id: agendamentoId },
    data: {
      status: novoStatus,
      ...(novoStatus === 'cancelado'
        ? { motivo_cancelamento: motivo || null, cancelado_por_id: usuarioId }
        : {})
    },
    include: {
      pet: { select: { id: true, nome: true } },
      tutor: { select: { id: true, nome: true, email: true } }
    }
  });
}

/**
 * Remarcar é mudar o horário mantendo o mesmo compromisso — refaz as duas
 * checagens (grade e conflito), porque o horário novo é tão novo quanto o de
 * uma criação.
 */
export async function remarcar({ tenantId, agendamentoId, veterinarioId, inicio, duracaoMinutos }: {
  tenantId: string;
  agendamentoId: string;
  /** Só o dono da agenda remarca: ver `alterarStatus`. */
  veterinarioId?: string;
  inicio: string | Date;
  duracaoMinutos?: number;
}) {
  const agendamento = await prisma.agendamento.findFirst({
    where: { id: agendamentoId, tenant_id: tenantId, ...(veterinarioId ? { veterinario_id: veterinarioId } : {}) }
  });

  if (!agendamento) {
    throw new NotFoundError('Agendamento não encontrado.');
  }
  if (!STATUS_QUE_OCUPAM.includes(agendamento.status)) {
    throw new ValidationError('Só dá para remarcar um agendamento pendente ou confirmado.');
  }

  const dataInicio = new Date(inicio);
  if (Number.isNaN(dataInicio.getTime()) || dataInicio.getTime() < Date.now()) {
    throw new ValidationError('Data de remarcação inválida.');
  }

  // Remarcar sem dizer a duracao mantem a que ja estava marcada.
  const duracaoAtual =
    (new Date(agendamento.fim).getTime() - new Date(agendamento.inicio).getTime()) / MINUTO_EM_MS;
  const duracao = duracaoValida(duracaoMinutos || duracaoAtual);
  const dataFim = new Date(dataInicio.getTime() + duracao * MINUTO_EM_MS);

  if (
    !(await dentroDaGrade({
      tenantId,
      veterinarioId: agendamento.veterinario_id,
      inicio: dataInicio,
      fim: dataFim
    }))
  ) {
    throw new ValidationError('O veterinário não atende nesse horário.');
  }

  return prisma.$transaction(async (tx: Transacao) => {
    const conflito = await encontrarConflito(
      {
        tenantId,
        veterinarioId: agendamento.veterinario_id,
        inicio: dataInicio,
        fim: dataFim,
        ignorarId: agendamentoId
      },
      tx
    );
    if (conflito) {
      throw new ValidationError('Esse horário já está ocupado na agenda do veterinário.');
    }

    return tx.agendamento.update({
      where: { id: agendamentoId },
      data: { inicio: dataInicio, fim: dataFim, lembrete_enviado: false }
    });
  });
}

/**
 * Horários livres de um veterinário num dia, já descontando o que está
 * ocupado. É o que o tutor vê ao escolher.
 *
 * O `getHorariosDisponiveis` que existia antes devolvia a faixa crua da grade
 * ("08:00 às 18:00") sem fatiar em slots e sem olhar o que já estava marcado —
 * ou seja, oferecia horário ocupado.
 */
export async function horariosLivres({ tenantId, veterinarioId, data, duracaoMinutos = DURACAO_PADRAO_MIN }: {
  tenantId: string;
  veterinarioId: string;
  data: string | Date;
  duracaoMinutos?: number;
}): Promise<Array<{ inicio: string; fim: string }>> {
  if (Number.isNaN(new Date(data).getTime())) {
    throw new ValidationError('Data inválida.');
  }
  // O dia pedido é um dia do calendário do Brasil, e as faixas da grade são
  // horas do relógio do Brasil. Até 08/10/2026 as duas coisas eram lidas no
  // relógio do servidor (UTC): a grade "09:00–17:00" era oferecida ao tutor
  // das 06:00 às 14:00.
  const dia = diaPedido(data);

  const grade = await prisma.agendaDisponivel.findMany({
    where: { tenant_id: tenantId, veterinario_id: veterinarioId, dia_semana: dia.diaDaSemana, ativo: true },
    orderBy: { hora_inicio: 'asc' }
  });

  if (grade.length === 0) return [];

  const inicioDoDia = instanteDoRelogio(dia.ano, dia.mes, dia.dia);
  const fimDoDia = new Date(inicioDoDia.getTime() + DIA_EM_MS);

  const ocupados = await prisma.agendamento.findMany({
    where: {
      tenant_id: tenantId,
      veterinario_id: veterinarioId,
      status: { in: STATUS_QUE_OCUPAM },
      inicio: { gte: inicioDoDia, lt: fimDoDia }
    },
    select: { inicio: true, fim: true }
  });

  const duracao = duracaoValida(duracaoMinutos);
  const agora = Date.now();
  const livres: Array<{ inicio: string; fim: string }> = [];

  for (const faixa of grade as Array<{ hora_inicio: string; hora_fim: string }>) {
    const cursor = instanteDoRelogio(dia.ano, dia.mes, dia.dia, emMinutos(faixa.hora_inicio));
    const limite = instanteDoRelogio(dia.ano, dia.mes, dia.dia, emMinutos(faixa.hora_fim));

    while (cursor.getTime() + duracao * MINUTO_EM_MS <= limite.getTime()) {
      const slotInicio = new Date(cursor);
      const slotFim = new Date(cursor.getTime() + duracao * MINUTO_EM_MS);

      const colide = (ocupados as Array<{ inicio: Date; fim: Date }>).some(
        (o) => new Date(o.inicio) < slotFim && new Date(o.fim) > slotInicio
      );

      // Horário que já passou não é vaga livre.
      if (!colide && slotInicio.getTime() > agora) {
        livres.push({ inicio: slotInicio.toISOString(), fim: slotFim.toISOString() });
      }

      cursor.setTime(cursor.getTime() + duracao * MINUTO_EM_MS);
    }
  }

  return livres;
}

