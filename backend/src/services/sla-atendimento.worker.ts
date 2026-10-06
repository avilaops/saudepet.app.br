import type { StatusAtendimento, TipoAtendimento } from '@prisma/client';
import prisma from '../config/database';
import { destinatariosAdmin } from './notificacao-admin.service';

const emailService = require('./email.service');

/**
 * Vigia de SLA dos chamados sem aceite.
 *
 * O produto tinha o e-mail `enviarEmailAlertaSlaAdmin` escrito, com template
 * completo ("Chamado #X sem aceite há Y — Ação Manual Requerida"), e NADA o
 * chamava: nenhum arquivo do backend, nenhum worker, nenhum controller. Na
 * prática, um chamado de emergência que ficasse sem veterinário só era
 * descoberto se alguém estivesse com a torre de controle aberta no momento
 * certo — ou pela reclamação do tutor.
 *
 * Este worker fecha isso: a cada ciclo procura chamado esperando aceite além do
 * prazo e avisa a equipe uma única vez por chamado.
 */

// Emergência tem prazo curto de propósito: é o caso em que a espera custa caro.
const MINUTOS_SLA: Record<TipoAtendimento, number> = {
  emergencia: 10,
  consulta_domiciliar: 30,
  teleorientacao: 20,
  // Preventivos: ninguém está esperando com o animal passando mal, e alertar a
  // equipe em vinte minutos por uma vacina marcada seria ruído que faz o alerta
  // de emergência perder o valor.
  vacinacao: 120,
  avaliacao: 60,
  consulta_rotina: 120
};
const MINUTOS_PADRAO = 30;

const AGUARDANDO_ACEITE: StatusAtendimento[] = ['criado', 'procurando_veterinario', 'oferta_enviada'];

// Marca gravada na própria solicitação: sem ela, cada ciclo mandaria o alerta de
// novo e a equipe passaria a filtrar o assunto no e-mail.
const MARCA_ALERTA = '[sla_alertado]';

const INTERVALO_PADRAO_MS = 5 * 60 * 1000;

interface ResultadoDoCiclo {
  verificados: number;
  alertados: number;
}

function minutosDeEspera(criadoEm: Date | string | number): number {
  return Math.floor((Date.now() - new Date(criadoEm).getTime()) / 60000);
}

function rotuloDeEspera(minutos: number): string {
  if (minutos < 60) return `${minutos} minutos`;
  const horas = Math.floor(minutos / 60);
  return horas < 24 ? `${horas}h${String(minutos % 60).padStart(2, '0')}` : `${Math.floor(horas / 24)} dias`;
}

async function verificarSla(): Promise<ResultadoDoCiclo> {
  // Teto largo: o pior caso é um chamado antigo esquecido, e é justamente ele
  // que a equipe precisa ver.
  const candidatos = await prisma.solicitacao.findMany({
    where: {
      status: { in: AGUARDANDO_ACEITE },
      criado_em: { lte: new Date(Date.now() - Math.min(...Object.values(MINUTOS_SLA)) * 60 * 1000) }
    },
    select: {
      id: true, tenant_id: true, tipo_atendimento: true, criado_em: true,
      observacoes: true, localizacao_cliente: true,
      tutor: { select: { nome: true, cidade: true } }
    },
    take: 200
  });

  let alertados = 0;

  for (const solicitacao of candidatos) {
    if (String(solicitacao.observacoes || '').includes(MARCA_ALERTA)) continue;

    const limite = MINUTOS_SLA[solicitacao.tipo_atendimento] ?? MINUTOS_PADRAO;
    const espera = minutosDeEspera(solicitacao.criado_em);
    if (espera < limite) continue;

    try {
      const destinatarios = await destinatariosAdmin(solicitacao.tenant_id);

      if (destinatarios.length > 0) {
        await emailService.enviarEmailAlertaSlaAdmin(destinatarios.join(','), {
          protocolo: String(solicitacao.id).slice(0, 8).toUpperCase(),
          bairroCidade: solicitacao.localizacao_cliente || solicitacao.tutor?.cidade || 'localização não informada',
          tempoDecorrido: rotuloDeEspera(espera),
          adminUrl: 'https://saudepet.app.br/admin/operacoes'
        });
      }

      // Carimba mesmo sem destinatário: um tenant sem admin cadastrado não pode
      // fazer o worker reprocessar a mesma solicitação para sempre.
      await prisma.solicitacao.update({
        where: { id: solicitacao.id },
        data: {
          observacoes: `${solicitacao.observacoes ? `${solicitacao.observacoes} ` : ''}${MARCA_ALERTA}`
        }
      });

      alertados += 1;
    } catch (erro) {
      console.error(`⚠️  [SLA] Falha ao alertar sobre ${solicitacao.id} (ignorado):`, (erro as Error).message);
    }
  }

  return { verificados: candidatos.length, alertados };
}

function iniciarWorkerSla(intervaloMs: number = INTERVALO_PADRAO_MS): NodeJS.Timeout {
  const ciclo = (): void => {
    verificarSla().catch((erro: unknown) => console.error('⚠️  [SLA] Ciclo falhou (ignorado):', (erro as Error).message));
  };

  ciclo();
  const timer = setInterval(ciclo, intervaloMs);
  // `unref` para o processo poder encerrar sem esperar o próximo ciclo.
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏱️  Worker de SLA ativo (a cada ${Math.round(intervaloMs / 60000)} min)`);
  return timer;
}

export { verificarSla, iniciarWorkerSla, MINUTOS_SLA, MARCA_ALERTA };
