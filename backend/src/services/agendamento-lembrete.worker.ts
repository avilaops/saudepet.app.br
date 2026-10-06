import type { TipoAtendimento } from '@prisma/client';
import prisma from '../config/database';
import { formatarDataHora } from './agendamento-notificacao.service';

const emailService = require('./email.service');

/**
 * Lembrete de véspera das consultas agendadas.
 *
 * `Agendamento.lembrete_enviado` existia desde a criação da agenda e nenhum
 * worker o consumia — a remarcação até o resetava para `false`, preparando um
 * aviso que nunca saía. Este worker fecha o circuito: de tempos em tempos,
 * avisa o tutor das consultas que começam dentro da janela e marca a coluna.
 *
 * Remarcar reseta `lembrete_enviado` no service, então uma consulta remarcada
 * para outro dia volta sozinha para a fila de aviso.
 */

// Consulta que começa em até 24h gera o lembrete. Janela de véspera: menos que
// isso vira aviso em cima da hora; mais, o tutor esquece de novo.
const JANELA_HORAS = 24;

const INTERVALO_MS = 15 * 60 * 1000;
const ATRASO_INICIAL_MS = 90 * 1000;
const LOTE = 100;

const TIPO_LABEL: Partial<Record<TipoAtendimento, string>> = {
  emergencia: 'Emergência',
  consulta_domiciliar: 'Consulta domiciliar',
  teleorientacao: 'Teleconsulta'
};

interface ResultadoDoCiclo {
  encontrados: number;
  avisados: number;
}

async function processarLembretesDeConsulta(): Promise<ResultadoDoCiclo> {
  const agora = new Date();
  const limite = new Date(agora.getTime() + JANELA_HORAS * 3600000);

  const pendentes = await prisma.agendamento.findMany({
    where: {
      lembrete_enviado: false,
      status: { in: ['pendente', 'confirmado'] },
      inicio: { gte: agora, lte: limite }
    },
    orderBy: { inicio: 'asc' },
    take: LOTE,
    include: {
      pet: { select: { nome: true } },
      tutor: { select: { id: true, nome: true, email: true } },
      veterinario: { select: { usuario: { select: { nome: true } } } }
    }
  });

  let avisados = 0;

  for (const agendamento of pendentes) {
    try {
      if (agendamento.tutor?.email) {
        await emailService.enviarEmailAgendamentoTutor(agendamento.tutor.email, {
          evento: 'lembrete',
          nomeTutor: agendamento.tutor.nome,
          nomePet: agendamento.pet?.nome || 'seu pet',
          nomeVet: agendamento.veterinario?.usuario?.nome
            ? `Dr(a). ${agendamento.veterinario.usuario.nome}`
            : 'veterinário responsável',
          dataHora: formatarDataHora(agendamento.inicio),
          tipoConsulta: TIPO_LABEL[agendamento.tipo_atendimento] || 'Atendimento'
        });
        avisados += 1;
      }

      // Push com o mesmo conteúdo — alcança o tutor com o app fechado.
      if (agendamento.tutor?.id) {
        const pushService = require('./push.service') as typeof import('./push.service');
        void pushService.enviarParaUsuario(agendamento.tutor.id, {
          title: '📅 Lembrete de consulta',
          body: `${agendamento.pet?.nome || 'Seu pet'} tem ${TIPO_LABEL[agendamento.tipo_atendimento]?.toLowerCase() || 'atendimento'} em ${formatarDataHora(agendamento.inicio)}.`,
          url: '/tutor/agenda',
          tag: `agendamento-${agendamento.id}`
        });
      }

      // Tutor sem e-mail também marca: não há para onde avisar, e varrer o
      // mesmo registro a cada ciclo até a consulta chegar não muda isso.
      await prisma.agendamento.update({
        where: { id: agendamento.id },
        data: { lembrete_enviado: true }
      });
    } catch (erro) {
      // Falha de envio não marca: o próximo ciclo tenta de novo.
      console.error(`⚠️  [AGENDA] Falha no lembrete da consulta ${agendamento.id} (ignorado):`, (erro as Error).message);
    }
  }

  return { encontrados: pendentes.length, avisados };
}

function startAgendamentoLembreteWorker(): NodeJS.Timeout {
  console.log(`⏰ [WORKER] Lembrete de consultas agendadas inicializado (a cada 15 min, véspera de ${JANELA_HORAS}h).`);

  const ciclo = async (): Promise<void> => {
    try {
      const { encontrados, avisados } = await processarLembretesDeConsulta();
      if (encontrados > 0) {
        console.log(`⏰ [AGENDA] ${avisados}/${encontrados} lembrete(s) de consulta enviado(s).`);
      }
    } catch (erro) {
      console.error('❌ [AGENDA] Ciclo de lembretes falhou (ignorado):', (erro as Error).message);
    }
  };

  setTimeout(ciclo, ATRASO_INICIAL_MS);
  return setInterval(ciclo, INTERVALO_MS);
}

export {
  startAgendamentoLembreteWorker,
  processarLembretesDeConsulta,
  JANELA_HORAS
};
