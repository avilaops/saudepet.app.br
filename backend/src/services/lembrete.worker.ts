import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import * as pushService from './push.service';

const emailService = require('./email.service');

/**
 * Aviso dos lembretes do pet.
 *
 * `lembretes_pet` tem a coluna `notificado` desde que nasceu e ninguém a marcava:
 * o retorno sugerido pelo veterinário e o reforço da vacina ficavam gravados sem
 * chegar a lugar nenhum. Os três templates de e-mail (`lembreteRetorno`,
 * `alertaVacina`, `lembreteMedicamento`) também já existiam sem nenhum chamador.
 *
 * O worker fecha esse circuito: uma vez por hora, avisa o tutor dos lembretes que
 * vencem dentro da janela de antecedência e marca `notificado` para não repetir.
 */

// Com quantos dias de antecedência o tutor é avisado. Retorno e vacina precisam
// de tempo para caber na agenda de alguém — avisar no próprio dia é tarde.
const DIAS_DE_ANTECEDENCIA = 3;

const INTERVALO_MS = 60 * 60 * 1000;

// Primeiro ciclo depois do boot, para não competir com a subida do servidor.
const ATRASO_INICIAL_MS = 60 * 1000;

// Quantos lembretes por ciclo. O limite existe para o dia em que a base crescer:
// o que sobrar é avisado no ciclo seguinte, uma hora depois.
const LOTE = 200;

/** O lembrete como o worker o carrega: com pet, tutor e o vet que o pediu. */
type LembreteComDestinatario = Prisma.LembretePetGetPayload<{
  include: {
    pet: { include: { tutor: { select: { id: true; nome: true; email: true } } } };
    veterinario: { select: { usuario: { select: { nome: true } } } };
  };
}>;

interface ResultadoDoCiclo {
  encontrados: number;
  avisados: number;
}

function formatarData(data: Date | string | number): string {
  return new Date(data).toLocaleDateString('pt-BR');
}

async function enviarAviso(lembrete: LembreteComDestinatario): Promise<boolean> {
  const tutor = lembrete.pet?.tutor;
  if (!tutor?.email) return false;

  const dados = {
    nomeTutor: tutor.nome,
    nomePet: lembrete.pet?.nome || 'seu pet'
  };

  // Push acompanha o e-mail: é o canal que alcança o app fechado. Os títulos
  // por tipo espelham os três templates de e-mail.
  const tituloPush = lembrete.tipo === 'vacina'
    ? `💉 Vacina de ${dados.nomePet} vencendo`
    : lembrete.tipo === 'medicamento'
      ? `💊 Medicamento de ${dados.nomePet}`
      : `🐾 Lembrete: ${dados.nomePet}`;
  void pushService.enviarParaUsuario(tutor.id, {
    title: tituloPush,
    body: `${lembrete.titulo} — ${formatarData(lembrete.data_lembrete)}.`,
    url: '/tutor/lembretes',
    tag: `lembrete-${lembrete.id}`
  });

  if (lembrete.tipo === 'vacina') {
    await emailService.enviarEmailAlertaVacina(tutor.email, {
      ...dados,
      // O título do lembrete de reforço é "Reforço da vacina <nome>".
      nomeVacina: lembrete.titulo.replace(/^Refor[çc]o da vacina\s*/i, '') || lembrete.titulo,
      dataVencimento: formatarData(lembrete.data_lembrete)
    });
    return true;
  }

  if (lembrete.tipo === 'medicamento') {
    await emailService.enviarEmailLembreteMedicamento(tutor.email, {
      ...dados,
      nomeMedicamento: lembrete.titulo,
      posologia: `Previsto para ${formatarData(lembrete.data_lembrete)}`
    });
    return true;
  }

  // Retorno e qualquer lembrete criado pelo tutor caem no template de retorno,
  // que é o genérico "há algo marcado para o seu pet nesta data".
  //
  // `LembretePet.veterinario_id` passou a existir, então o retorno pedido por
  // um profissional é assinado com o nome dele. Continua caindo no genérico
  // quando foi o próprio tutor que criou o lembrete, ou quando o registro é
  // anterior à coluna — nesses casos não há a quem atribuir.
  const nomeDoVet = lembrete.veterinario?.usuario?.nome;

  await emailService.enviarEmailLembreteRetorno(tutor.email, {
    ...dados,
    nomeVet: nomeDoVet ? `Dr(a). ${nomeDoVet}` : 'veterinário responsável',
    motivoRetorno:
      lembrete.mensagem ||
      `${lembrete.titulo} — previsto para ${formatarData(lembrete.data_lembrete)}`
  });
  return true;
}

async function processarLembretesPendentes(): Promise<ResultadoDoCiclo> {
  const limite = new Date();
  limite.setDate(limite.getDate() + DIAS_DE_ANTECEDENCIA);

  const pendentes = await prisma.lembretePet.findMany({
    where: {
      concluido: false,
      notificado: false,
      data_lembrete: { lte: limite }
    },
    include: {
      pet: {
        include: { tutor: { select: { id: true, nome: true, email: true } } }
      },
      // Para assinar o e-mail com o nome de quem pediu o retorno.
      veterinario: { select: { usuario: { select: { nome: true } } } }
    },
    orderBy: { data_lembrete: 'asc' },
    take: LOTE
  });

  let avisados = 0;

  for (const lembrete of pendentes) {
    try {
      const enviado = await enviarAviso(lembrete);

      // Sem e-mail do tutor não há como avisar. Marcar como notificado evita
      // varrer o mesmo registro de hora em hora para sempre.
      await prisma.lembretePet.update({
        where: { id: lembrete.id },
        data: { notificado: true }
      });

      if (enviado) avisados += 1;
    } catch (error) {
      // Falha de envio não marca `notificado`: o próximo ciclo tenta de novo.
      console.error(`⚠️  [LEMBRETES] Falha ao avisar o lembrete ${lembrete.id} (ignorado):`, (error as Error).message);
    }
  }

  return { encontrados: pendentes.length, avisados };
}

function startLembreteWorker(): NodeJS.Timeout {
  console.log(`⏰ [WORKER] Aviso de lembretes do pet inicializado (a cada 1h, ${DIAS_DE_ANTECEDENCIA} dias de antecedência).`);

  const ciclo = async (): Promise<void> => {
    try {
      const { encontrados, avisados } = await processarLembretesPendentes();
      if (encontrados > 0) {
        console.log(`⏰ [LEMBRETES] ${avisados}/${encontrados} lembrete(s) avisado(s) ao tutor.`);
      }
    } catch (error) {
      console.error('❌ [LEMBRETES] Ciclo falhou (ignorado):', (error as Error).message);
    }
  };

  setTimeout(ciclo, ATRASO_INICIAL_MS);
  return setInterval(ciclo, INTERVALO_MS);
}

export {
  startLembreteWorker,
  processarLembretesPendentes,
  DIAS_DE_ANTECEDENCIA
};
