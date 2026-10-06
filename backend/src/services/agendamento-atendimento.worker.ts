import type { StatusAgendamento } from '@prisma/client';
import prisma from '../config/database';
import { abrirAtendimentoDoAgendamento, STATUS_AUTOMATICO } from './agendamento-atendimento.service';

/**
 * Abre o atendimento das consultas confirmadas quando a hora chega.
 *
 * Sem isto, o veterinário marcava a consulta na agenda e, no dia, precisava
 * abrir um chamado do zero para conseguir registrar prontuário e cobrar —
 * a agenda e o prontuário eram dois mundos (ver
 * `agendamento-atendimento.service.js`).
 */

// Abre a partir de 15 minutos antes do horário marcado — o veterinário
// costuma chegar antes, e o atendimento precisa existir quando ele chega.
const ANTECEDENCIA_MIN = 15;
// Atrasos acontecem; depois disso presume-se que a consulta não ocorreu e
// abrir o atendimento sozinho só criaria registro órfão.
const TOLERANCIA_ATRASO_MIN = 120;

const INTERVALO_MS = 5 * 60 * 1000;
const ATRASO_INICIAL_MS = 120 * 1000;
const LOTE = 50;

interface ResultadoDoCiclo {
  encontrados: number;
  abertos: number;
  ignorados: number;
}

async function processarAgendamentosDoMomento(): Promise<ResultadoDoCiclo> {
  const agora = new Date();
  const ate = new Date(agora.getTime() + ANTECEDENCIA_MIN * 60000);
  const desde = new Date(agora.getTime() - TOLERANCIA_ATRASO_MIN * 60000);

  const candidatos = await prisma.agendamento.findMany({
    where: {
      // O serviço ainda é .js e devolve string[]; o cast some quando ele migrar.
      status: { in: STATUS_AUTOMATICO as StatusAgendamento[] },
      solicitacao_id: null,
      inicio: { gte: desde, lte: ate }
    },
    orderBy: { inicio: 'asc' },
    take: LOTE,
    select: { id: true, tenant_id: true }
  });

  let abertos = 0;
  let ignorados = 0;

  for (const agendamento of candidatos) {
    try {
      const { reaproveitada } = await abrirAtendimentoDoAgendamento({
        agendamentoId: agendamento.id,
        tenantId: agendamento.tenant_id,
        ator: { tipo: 'sistema' },
        origem: 'worker'
      });
      if (!reaproveitada) abertos += 1;
    } catch (erro) {
      // Conflito conhecido (tutor com outro atendimento aberto) não é falha:
      // o próximo ciclo tenta de novo enquanto estiver dentro da janela.
      ignorados += 1;
      console.warn(`⚠️  [AGENDA→ATENDIMENTO] Consulta ${agendamento.id} não abriu agora: ${(erro as Error).message}`);
    }
  }

  return { encontrados: candidatos.length, abertos, ignorados };
}

function startAgendamentoAtendimentoWorker(): NodeJS.Timeout {
  console.log(`🩺 [WORKER] Agenda → atendimento inicializado (a cada 5 min, ${ANTECEDENCIA_MIN} min de antecedência).`);

  const ciclo = async (): Promise<void> => {
    try {
      const { encontrados, abertos, ignorados } = await processarAgendamentosDoMomento();
      if (encontrados > 0) {
        console.log(`🩺 [AGENDA→ATENDIMENTO] ${abertos} aberto(s), ${ignorados} adiado(s) de ${encontrados} candidato(s).`);
      }
    } catch (erro) {
      console.error('❌ [AGENDA→ATENDIMENTO] Ciclo falhou (ignorado):', (erro as Error).message);
    }
  };

  setTimeout(ciclo, ATRASO_INICIAL_MS);
  return setInterval(ciclo, INTERVALO_MS);
}

export {
  startAgendamentoAtendimentoWorker,
  processarAgendamentosDoMomento,
  ANTECEDENCIA_MIN,
  TOLERANCIA_ATRASO_MIN
};
