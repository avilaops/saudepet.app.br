import { expirarPedidosVencidos } from './pedido.service';

/**
 * O relógio do estoque reservado.
 *
 * O pedido baixa o estoque no fechamento para que duas pessoas não paguem pelo
 * mesmo último item. A contrapartida é que um Pix gerado e esquecido prenderia
 * esse item para sempre: a loja veria "sem estoque" numa prateleira cheia, e o
 * próximo tutor levaria um "acabou" que não é verdade.
 *
 * Este worker é quem fecha o ciclo. Ele não decide nada — a regra inteira mora
 * em `expirarPedidosVencidos`, que relê cada pedido dentro da própria transação
 * antes de devolver qualquer coisa. Se o webhook do pagamento chegou no meio do
 * caminho, o pedido já não está mais `aguardando_pagamento` e o worker passa
 * reto.
 */

const INTERVALO_MS = 5 * 60 * 1000;
// Espera o servidor terminar de subir antes da primeira varredura: competir com
// o boot por conexão do banco não adianta nada e polui o log de partida.
const ATRASO_INICIAL_MS = 60 * 1000;

let temporizador: NodeJS.Timeout | null = null;

async function ciclo() {
  try {
    const resultado = await expirarPedidosVencidos();
    if (resultado.expirados > 0) {
      console.log(
        `🛒 [MERCADO] ${resultado.expirados} pedido(s) vencido(s) sem pagamento — estoque devolvido.`
      );
    }
  } catch (erro) {
    // Falhar aqui não pode matar o worker: no ciclo seguinte ele tenta de novo,
    // e os pedidos continuam vencidos esperando.
    console.error('❌ [MERCADO] ciclo de expiração falhou:', (erro as Error).message);
  }
}

export function iniciarWorkerDoMercado() {
  if (temporizador) return;

  setTimeout(() => {
    void ciclo();
    temporizador = setInterval(() => void ciclo(), INTERVALO_MS);
    // O worker não é motivo para o processo continuar vivo: sem `unref`, um
    // encerramento limpo ficaria pendurado até o próximo ciclo.
    temporizador.unref?.();
  }, ATRASO_INICIAL_MS).unref?.();

  console.log('🛒 [MERCADO] worker de expiração de pedidos iniciado.');
}

export function pararWorkerDoMercado() {
  if (!temporizador) return;
  clearInterval(temporizador);
  temporizador = null;
}
