import type { StatusAtendimento } from '@prisma/client';
import prisma from '../config/database';

/**
 * Sinais de que a operação travou em algum ponto.
 *
 * Cada sinal é uma contagem de coisas que já deveriam ter andado: o chamado
 * que ninguém aceitou e também não expirou, o atendimento fechado sem
 * prontuário em PDF, o agendamento que o veterinário não respondeu. Quem
 * consome é o n8n (`GET /api/v1/automation/operacao/saude`), que avisa o
 * administrador — a regra do que é "parado" fica aqui, junto dos dados.
 *
 * Só leitura. Nenhum sinal corrige nada.
 */

export type Gravidade = 'alta' | 'media' | 'baixa';

export type Sinal = {
  codigo: string;
  titulo: string;
  gravidade: Gravidade;
  total: number;
  /** Tela do painel do admin onde o caso aparece. */
  onde: string;
};

export type SaudeOperacional = {
  gerado_em: string;
  ok: boolean;
  total_de_alertas: number;
  alertas: Sinal[];
  /** Todos os sinais medidos, inclusive os zerados, para conferência. */
  sinais: Sinal[];
};

const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

/** A busca por veterinário desiste sozinha bem antes disso. */
const CHAMADO_PARADO_APOS = 30 * MINUTO;
/** A reemissão de documentos roda a cada 30 minutos; uma hora cobre duas passadas. */
const DOCUMENTO_PENDENTE_APOS = HORA;
/** A reemissão desiste depois de 7 dias; passado isso o alerta viraria ruído eterno. */
const DOCUMENTO_JANELA = 7 * DIA;
const ATENDIMENTO_ABERTO_APOS = 12 * HORA;
const AGENDAMENTO_SEM_RESPOSTA_APOS = DIA;
const CREDENCIAMENTO_PARADO_APOS = 2 * DIA;
const JANELA_RECENTE = DIA;

const STATUS_BUSCANDO: StatusAtendimento[] = ['criado', 'procurando_veterinario', 'oferta_enviada'];
const STATUS_EM_CURSO: StatusAtendimento[] = [
  'veterinario_encontrado',
  'aceito',
  'a_caminho',
  'chegou',
  'atendimento_em_andamento'
];
const STATUS_FECHADOS: StatusAtendimento[] = ['finalizado', 'concluido', 'encaminhado'];
const STATUS_SEM_ATENDIMENTO: StatusAtendimento[] = ['sem_veterinario', 'expirado'];

export async function medirSaudeOperacional(agora: Date = new Date()): Promise<SaudeOperacional> {
  const antes = (intervalo: number) => new Date(agora.getTime() - intervalo);

  const [
    chamadosParados,
    documentosPendentes,
    pagamentosComProblema,
    chamadosSemVeterinario,
    atendimentosAbertos,
    agendamentosSemResposta,
    credenciamentosParados
  ] = await Promise.all([
    prisma.solicitacao.count({
      where: { status: { in: STATUS_BUSCANDO }, criado_em: { lte: antes(CHAMADO_PARADO_APOS) } }
    }),
    prisma.solicitacao.count({
      where: {
        status: { in: STATUS_FECHADOS },
        finalizado_em: { gte: antes(DOCUMENTO_JANELA), lte: antes(DOCUMENTO_PENDENTE_APOS) },
        prontuario_pdf_url: null,
        prontuario: { isNot: null }
      }
    }),
    prisma.payment.count({
      where: {
        status: { in: ['FAILED', 'CHARGEBACK', 'DISPUTED'] },
        atualizado_em: { gte: antes(JANELA_RECENTE) }
      }
    }),
    prisma.solicitacao.count({
      where: { status: { in: STATUS_SEM_ATENDIMENTO }, atualizado_em: { gte: antes(JANELA_RECENTE) } }
    }),
    prisma.solicitacao.count({
      where: { status: { in: STATUS_EM_CURSO }, atualizado_em: { lte: antes(ATENDIMENTO_ABERTO_APOS) } }
    }),
    prisma.agendamento.count({
      where: {
        status: 'pendente',
        OR: [{ criado_em: { lte: antes(AGENDAMENTO_SEM_RESPOSTA_APOS) } }, { inicio: { lte: agora } }]
      }
    }),
    prisma.veterinario.count({
      where: {
        status_credenciamento: { in: ['PENDING_REVIEW', 'UNDER_REVIEW'] },
        criado_em: { lte: antes(CREDENCIAMENTO_PARADO_APOS) }
      }
    })
  ]);

  const sinais: Sinal[] = [
    {
      codigo: 'chamados_parados',
      titulo: 'Chamados buscando veterinário há mais de 30 minutos',
      gravidade: 'alta',
      total: chamadosParados,
      onde: '/admin/atendimentos'
    },
    {
      codigo: 'documentos_pendentes',
      titulo: 'Atendimentos fechados há mais de 1 hora sem prontuário em PDF',
      gravidade: 'alta',
      total: documentosPendentes,
      onde: '/admin/atendimentos'
    },
    {
      codigo: 'pagamentos_com_problema',
      titulo: 'Pagamentos recusados ou contestados nas últimas 24 horas',
      gravidade: 'alta',
      total: pagamentosComProblema,
      onde: '/admin/pagamentos'
    },
    {
      codigo: 'chamados_sem_veterinario',
      titulo: 'Tutores que ficaram sem veterinário nas últimas 24 horas',
      gravidade: 'media',
      total: chamadosSemVeterinario,
      onde: '/admin/atendimentos'
    },
    {
      codigo: 'atendimentos_abertos',
      titulo: 'Atendimentos em curso sem movimento há mais de 12 horas',
      gravidade: 'media',
      total: atendimentosAbertos,
      onde: '/admin/atendimentos'
    },
    {
      codigo: 'agendamentos_sem_resposta',
      titulo: 'Agendamentos aguardando o veterinário há mais de 24 horas ou já vencidos',
      gravidade: 'media',
      total: agendamentosSemResposta,
      onde: '/admin/atendimentos'
    },
    {
      codigo: 'credenciamentos_parados',
      titulo: 'Veterinários aguardando análise do cadastro há mais de 2 dias',
      gravidade: 'baixa',
      total: credenciamentosParados,
      onde: '/admin/veterinarios'
    }
  ];

  const alertas = sinais.filter((sinal) => sinal.total > 0);
  return {
    gerado_em: agora.toISOString(),
    ok: alertas.length === 0,
    total_de_alertas: alertas.length,
    alertas,
    sinais
  };
}
