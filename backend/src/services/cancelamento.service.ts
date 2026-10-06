import prisma from '../config/database';

/**
 * O que acontece com o dinheiro quando alguém cancela.
 *
 * Até aqui: nada. O tutor cancelava, o chamado morria, e o pagamento ficava
 * parado esperando alguém lembrar de estornar pelo painel. Com volume isso vira
 * reclamação e, pouco depois, contestação no cartão — que custa mais caro que o
 * próprio atendimento.
 *
 * A regra, escrita para ser lida por quem vai cancelar e não por quem escreveu
 * o código:
 *
 * - **Antes de alguém aceitar**, cancelar é livre e devolve tudo. Ninguém saiu
 *   de casa, ninguém perdeu nada.
 * - **Depois do aceite, com o veterinário a caminho**, fica uma taxa de
 *   deslocamento. O profissional interrompeu o que estava fazendo e pegou a
 *   estrada; cobrar zero seria transferir esse custo inteiro para ele.
 * - **Depois que o atendimento começou**, não há reembolso automático: o
 *   serviço foi prestado. Contestação existe e é caminho de gente, não de
 *   regra automática.
 * - **Se quem cancela é o veterinário ou a plataforma**, devolve tudo, em
 *   qualquer etapa. O tutor não pode pagar por uma desistência que não é dele.
 */

/** Percentual retido quando o profissional já estava a caminho. */
const PERCENTUAL_DESLOCAMENTO = 20;

/** Etapas em que ninguém saiu de casa ainda. */
const ANTES_DE_SAIR = ['criado', 'procurando_veterinario', 'oferta_enviada', 'veterinario_encontrado', 'aceito'];

/** Etapas em que o profissional já está na rua. */
const JA_NA_RUA = ['a_caminho', 'chegou'];

export type Politica = {
  reembolso: 'integral' | 'parcial' | 'nenhum';
  percentual_retido: number;
  /** Frase que a tela mostra ANTES de a pessoa confirmar. */
  texto: string;
};

export function politicaDeCancelamento({
  status,
  quemCancelou
}: {
  status: string;
  quemCancelou: 'tutor' | 'veterinario' | 'admin';
}): Politica {
  // Desistência que não é do tutor nunca custa a ele.
  if (quemCancelou !== 'tutor') {
    return {
      reembolso: 'integral',
      percentual_retido: 0,
      texto: 'O valor pago é devolvido integralmente.'
    };
  }

  if (ANTES_DE_SAIR.includes(status)) {
    return {
      reembolso: 'integral',
      percentual_retido: 0,
      texto: 'Cancelamento sem custo: nenhum profissional saiu para o atendimento ainda.'
    };
  }

  if (JA_NA_RUA.includes(status)) {
    return {
      reembolso: 'parcial',
      percentual_retido: PERCENTUAL_DESLOCAMENTO,
      texto:
        `O veterinário já está a caminho. Fica retida uma taxa de deslocamento de ${PERCENTUAL_DESLOCAMENTO}% ` +
        'e o restante é devolvido.'
    };
  }

  return {
    reembolso: 'nenhum',
    percentual_retido: 100,
    texto:
      'O atendimento já começou e não há devolução automática. Se algo deu errado, fale conosco — ' +
      'todo caso é analisado.'
  };
}

/**
 * Aplica a política a um atendimento cancelado.
 *
 * Nunca lança: o estorno é consequência do cancelamento, e um gateway fora do
 * ar não pode impedir alguém de cancelar um chamado. O que não sair aqui fica
 * registrado e visível para a equipe.
 */
export async function reembolsarCancelamento({
  atendimentoId,
  tenantId,
  status,
  quemCancelou,
  usuarioId
}: {
  atendimentoId: string;
  tenantId: string;
  /** O status ANTES do cancelamento — é ele que decide a política. */
  status: string;
  quemCancelou: 'tutor' | 'veterinario' | 'admin';
  usuarioId?: string | null;
}) {
  const politica = politicaDeCancelamento({ status, quemCancelou });

  if (politica.reembolso === 'nenhum') {
    return { politica, estornado: 0, motivo: 'sem_reembolso' };
  }

  const pagamento = await prisma.payment.findFirst({
    where: { atendimento_id: atendimentoId, tenant_id: tenantId, status: 'PAID' },
    select: { id: true, amount: true }
  });

  // Sem pagamento aprovado não há o que devolver — e isso é o caso comum de um
  // chamado cancelado antes de alguém aceitar.
  if (!pagamento) {
    return { politica, estornado: 0, motivo: 'sem_pagamento' };
  }

  const total = Number(pagamento.amount);
  const valor = politica.reembolso === 'integral'
    ? total
    : Math.round(total * (1 - politica.percentual_retido / 100) * 100) / 100;

  if (!(valor > 0)) {
    return { politica, estornado: 0, motivo: 'valor_zero' };
  }

  try {
    const paymentService = require('./payment/payment.service');
    await paymentService.refundPayment({
      paymentId: pagamento.id,
      amount: valor,
      reason: `Cancelamento (${quemCancelou}) em "${status}"`,
      requestedBy: usuarioId || null,
      tenantId
    });
    return { politica, estornado: valor, motivo: 'estornado' };
  } catch (erro) {
    // Falhar o estorno não pode desfazer o cancelamento: o chamado já não vale,
    // e prender o tutor num atendimento morto por causa do gateway seria pior.
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error(`⚠️  [Cancelamento] Estorno de ${atendimentoId} falhou (registrado):`, mensagem);
    return { politica, estornado: 0, motivo: 'falhou', erro: mensagem };
  }
}

export { PERCENTUAL_DESLOCAMENTO, ANTES_DE_SAIR, JA_NA_RUA };
