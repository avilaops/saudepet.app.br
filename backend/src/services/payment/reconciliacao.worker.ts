import type { StatusPagamento } from '@prisma/client';
import prisma from '../../config/database';

const paymentService = require('./payment.service');

/**
 * Confere no gateway o que aconteceu com as cobranças que ainda estão abertas.
 *
 * O webhook é o caminho rápido: o gateway avisa em segundos e a cobrança fecha.
 * Isto aqui é a rede embaixo dele — e existe porque em 27/08/2026 aconteceu
 * exatamente o que ela previne. Um pagamento real de R$ 0,10 foi aprovado no
 * Mercado Pago e ficou `PENDING` no nosso banco por horas, porque a assinatura
 * do webhook estava sendo recusada. Do lado de fora isso é indistinguível de
 * "o cliente não pagou": ele pagou, viu o dinheiro sair, e o sistema jurava
 * que não.
 *
 * ── O princípio ─────────────────────────────────────────────────────────
 *
 * "Pago" não pode depender de uma notificação ter chegado. Notificação se
 * perde: assinatura errada, servidor fora do ar por dois minutos, rede do
 * gateway com problema, retentativa que esgota. O único lugar que sabe a
 * verdade sobre dinheiro é o gateway, e perguntar a ele é barato.
 *
 * ── Por que passa pelo mesmo caminho do webhook ─────────────────────────
 *
 * Fechar cobrança não é só mudar um campo: marca splits como pagos, ativa
 * assinatura, libera pedido do Mercado. Duplicar isso aqui criaria duas
 * verdades que divergem na primeira mudança. Então a reconciliação descobre o
 * status e entrega para `processWebhookEvent`, que já é idempotente por
 * `external_event_id` — um caminho para fechar, dois gatilhos para acioná-lo.
 */

/** Estados em que a cobrança ainda pode mudar sozinha. */
const ABERTOS: StatusPagamento[] = ['CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'];

/**
 * Carência antes de conferir.
 *
 * O webhook costuma chegar em segundos. Perguntar ao gateway antes disso é
 * gastar chamada para descobrir o que já está a caminho — e atrapalhar o
 * diagnóstico, porque a cobrança fecharia pela reconciliação e o webhook
 * quebrado passaria despercebido.
 */
const CARENCIA_MIN = 3;

/**
 * Até quando insistir.
 *
 * Cobrança PIX expira em uma hora; cartão resolve em minutos. Uma semana cobre
 * com folga qualquer atraso real e impede a varredura de arrastar para sempre
 * uma cobrança que ninguém vai pagar.
 */
const JANELA_DIAS = 7;

/** Teto por rodada: reconciliação é manutenção, não pode competir com o produto. */
const LOTE = 40;

const INTERVALO_PADRAO_MS = 5 * 60 * 1000;
const MINUTO_EM_MS = 60_000;
const DIA_EM_MS = 86_400_000;

export type ResultadoDaReconciliacao = {
  conferidas: number;
  fechadas: number;
  divergentes: number;
  erros: number;
};

/**
 * Uma rodada.
 *
 * @returns `divergentes` é o número que importa acompanhar: cada uma é um
 *          pagamento que o webhook deveria ter fechado e não fechou. Zero
 *          significa que o canal rápido está funcionando; um número que sobe
 *          é o sintoma que aparece ANTES de alguém reclamar.
 */
export async function reconciliarPagamentos(agora = new Date()): Promise<ResultadoDaReconciliacao> {
  const resultado: ResultadoDaReconciliacao = { conferidas: 0, fechadas: 0, divergentes: 0, erros: 0 };

  const abertas = await prisma.payment.findMany({
    where: {
      status: { in: ABERTOS },
      external_payment_id: { not: null },
      criado_em: {
        lt: new Date(agora.getTime() - CARENCIA_MIN * MINUTO_EM_MS),
        gt: new Date(agora.getTime() - JANELA_DIAS * DIA_EM_MS)
      }
    },
    select: { id: true, tenant_id: true, provider: true, external_payment_id: true, status: true },
    orderBy: { criado_em: 'asc' },
    take: LOTE
  });

  for (const cobranca of abertas) {
    resultado.conferidas += 1;

    try {
      const gateway = await paymentService.getGateway(cobranca.provider, cobranca.tenant_id);
      const remoto = await gateway.getPaymentStatus(cobranca.external_payment_id as string);

      if (!remoto?.status || remoto.status === cobranca.status) continue;

      // `processWebhookEvent` mapeia o status BRUTO do provedor, e `mapStatus`
      // devolve 'PENDING' para tudo que não reconhece. Entregar o status já
      // traduzido faria um pagamento aprovado voltar como pendente — e ainda
      // seria contado aqui como reconciliado. Sem o bruto, não mexemos.
      if (!remoto.statusOriginal) {
        throw new Error(`gateway ${cobranca.provider} não devolveu o status bruto`);
      }

      resultado.divergentes += 1;
      console.warn(
        `⚠️  [RECONCILIAÇÃO] ${cobranca.external_payment_id}: aqui "${cobranca.status}", ` +
        `no ${cobranca.provider} "${remoto.status}". O webhook não fechou esta cobrança.`
      );

      // O id do evento é derivado do par (cobrança, status): rodar de novo com
      // o mesmo resultado é reconhecido como repetido e não reprocessa nada.
      await paymentService.processWebhookEvent({
        provider: cobranca.provider,
        eventId: `reconciliacao:${cobranca.external_payment_id}:${remoto.status}`,
        eventType: 'payment.reconciliado',
        paymentData: { id: String(cobranca.external_payment_id), status: remoto.statusOriginal },
        // A hora que vale é a da aprovação no gateway, não a da varredura.
        paidAt: remoto.paidAt || null,
        payload: { origem: 'reconciliacao', conferido_em: agora.toISOString() }
      });

      resultado.fechadas += 1;
    } catch (erro) {
      // Uma cobrança que falha não pode parar as outras: gateway instável ou
      // credencial de um tenant específico não é motivo para a varredura toda
      // desistir.
      resultado.erros += 1;
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error(`⚠️  [RECONCILIAÇÃO] ${cobranca.external_payment_id} não conferida (ignorado):`, mensagem);
    }
  }

  if (resultado.divergentes > 0) {
    console.warn(
      `🔴 [RECONCILIAÇÃO] ${resultado.divergentes} de ${resultado.conferidas} cobranças estavam ` +
      'desencontradas. Isso é falha do webhook, não da reconciliação — vale investigar a assinatura ' +
      'e a configuração do gateway.'
    );
  }

  return resultado;
}

export function iniciarWorkerDeReconciliacao(intervaloMs: number = INTERVALO_PADRAO_MS) {
  const ciclo = () => {
    reconciliarPagamentos().catch((erro: unknown) => {
      const mensagem = erro instanceof Error ? erro.message : String(erro);
      console.error('⚠️  [RECONCILIAÇÃO] Ciclo falhou (ignorado):', mensagem);
    });
  };

  ciclo();
  const timer = setInterval(ciclo, intervaloMs);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`⏱️  Worker de reconciliação de pagamento ativo (a cada ${Math.round(intervaloMs / 60000)} min)`);
  return timer;
}

module.exports = {
  reconciliarPagamentos,
  iniciarWorkerDeReconciliacao,
  ABERTOS,
  CARENCIA_MIN,
  JANELA_DIAS
};
