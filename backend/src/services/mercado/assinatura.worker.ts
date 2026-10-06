import { processarCiclosVencidos } from './assinatura.service';

/**
 * O relógio das assinaturas.
 *
 * Uma vez por hora, gera o pedido de cada assinatura ativa cuja data chegou.
 * Hora, e não dia: `proximo_ciclo_em` carrega a hora em que a pessoa assinou,
 * e ninguém precisa esperar até a meia-noite seguinte por um pedido que
 * venceu às nove da manhã. Não decide nada — a regra mora em
 * `processarCiclosVencidos`, que trata cada assinatura sozinha.
 */

const INTERVALO_MS = 60 * 60 * 1000;
const ATRASO_INICIAL_MS = 90 * 1000;

let temporizador: NodeJS.Timeout | null = null;

async function ciclo() {
  try {
    const resultado = await processarCiclosVencidos();
    if (resultado.verificadas > 0) {
      console.log(
        `🛒 [MERCADO] assinaturas: ${resultado.gerados} pedido(s) gerado(s), ${resultado.adiados} adiado(s) de ${resultado.verificadas}.`
      );
    }
  } catch (erro) {
    console.error('❌ [MERCADO] ciclo das assinaturas falhou:', (erro as Error).message);
  }
}

export function iniciarWorkerDeAssinaturas() {
  if (temporizador) return;

  setTimeout(() => {
    void ciclo();
    temporizador = setInterval(() => void ciclo(), INTERVALO_MS);
    temporizador.unref?.();
  }, ATRASO_INICIAL_MS).unref?.();

  console.log('🛒 [MERCADO] worker de assinaturas iniciado (a cada 1h).');
}

export function pararWorkerDeAssinaturas() {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
