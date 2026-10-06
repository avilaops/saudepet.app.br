import type { Request, Response } from 'express';
import type { Prisma, Transacao } from '@prisma/client';
import { asyncHandler } from '../middleware/error.middleware';
import PaymentGatewayService from '../services/payment-gateway.service';
import prisma from '../config/database';

/**
 * Controller para processar webhooks dos gateways de pagamento
 */

/** O que o controller lê do evento de pagamento devolvido pelo gateway. */
type DadosDoPagamentoNoEvento = {
  id?: unknown;
  gateway_payment_id?: unknown;
  payment_intent?: unknown;
  status?: unknown;
  [chave: string]: unknown;
};

/**
 * `verifyWebhook` do gateway abstrato devolve `unknown`; o Mercado Pago
 * concreto responde `{ success, event_type, event_data }`. O guard lê só o que
 * o controller sempre leu.
 */
type VerificacaoLida = { success: boolean; event_type?: unknown; event_data?: unknown; error?: unknown };

const ehObjeto = (valor: unknown): valor is Record<string, unknown> =>
  typeof valor === 'object' && valor !== null;

const lerVerificacao = (valor: unknown): VerificacaoLida => {
  if (!ehObjeto(valor)) return { success: false };
  return {
    success: Boolean(valor.success),
    event_type: valor.event_type,
    event_data: valor.event_data,
    error: valor.error
  };
};

const lerDadosDoPagamento = (valor: unknown): DadosDoPagamentoNoEvento =>
  ehObjeto(valor) ? valor : {};

/** `transacao.tutor_id` e afins são opcionais no schema; a carteira exige os dois lados. */
type TransacaoComPartes = Transacao & {
  tutor_id: string;
  veterinario_id: string;
  valor_tutor: Prisma.Decimal;
  valor_veterinario: Prisma.Decimal;
};

// Antes, uma transação sem tutor/veterinário/valores chegava ao Prisma com
// `null` e estourava erro de validação. Agora o erro é explícito e cai no
// mesmo `catch` de antes (500 para o gateway).
function exigirPartes(transacao: Transacao): TransacaoComPartes {
  const { tutor_id, veterinario_id, valor_tutor, valor_veterinario } = transacao;
  if (!tutor_id || !veterinario_id || valor_tutor === null || valor_veterinario === null) {
    throw new Error(`Transação ${transacao.id} sem tutor, veterinário ou valores para atualizar carteiras`);
  }
  return { ...transacao, tutor_id, veterinario_id, valor_tutor, valor_veterinario };
}

/**
 * Webhook Mercado Pago
 * POST /api/v1/webhooks/mercadopago/:tenantSlug
 */
const webhookMercadoPago = asyncHandler(async (req: Request, res: Response) => {
  const tenantSlug = String(req.params.tenantSlug);
  const payload = req.body;
  const signatureContext = {
    xSignature: req.headers['x-signature'],
    xRequestId: req.headers['x-request-id'],
    dataId: req.query['data.id'] || payload?.data?.id
  };

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug }
  });

  if (!tenant) {
    return res.status(404).json({ error: 'Tenant não encontrado' });
  }

  try {
    const gateway = await PaymentGatewayService.getGateway(tenant.id, 'mercado_pago');
    const verification = lerVerificacao(await gateway.verifyWebhook(payload, signatureContext));

    if (!verification.success) {
      console.error('❌ Webhook Mercado Pago inválido');
      return res.status(401).json({ error: 'Invalid webhook' });
    }

    console.log(`✅ Webhook Mercado Pago recebido: ${verification.event_type}`);

    // Mercado Pago usa tipo de notificação
    switch (payload.type) {
      case 'payment': {
        const paymentData = lerDadosDoPagamento(verification.event_data);

        if (paymentData.status === 'aprovada') {
          await processarPagamentoAprovado(tenant.id, paymentData);
        } else if (paymentData.status === 'rejeitada') {
          await processarPagamentoFalhou(tenant.id, paymentData);
        }
        break;
      }

      default:
        console.log(`ℹ️  Tipo não tratado: ${payload.type}`);
    }

    return res.status(200).send(); // Mercado Pago espera 200 vazio

  } catch (error) {
    console.error('❌ Erro ao processar webhook Mercado Pago:', error instanceof Error ? error.message : String(error));
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ═══════════════════════════════════════════════════════
// HELPERS - Processar eventos de pagamento
// ═══════════════════════════════════════════════════════

/** O id como o JavaScript o passava ao Prisma: o primeiro truthy, em string. */
const idDoGateway = (...candidatos: unknown[]): string | undefined => {
  const encontrado = candidatos.find(Boolean);
  return encontrado === undefined ? undefined : String(encontrado);
};

async function processarPagamentoAprovado(tenantId: string, paymentData: DadosDoPagamentoNoEvento) {
  const gatewayPaymentId = idDoGateway(paymentData.gateway_payment_id, paymentData.id);

  console.log(`💰 Processando pagamento aprovado: ${gatewayPaymentId}`);

  // Buscar transação pelo gateway_payment_id
  const transacao = await prisma.transacao.findFirst({
    where: {
      tenant_id: tenantId,
      gateway_transacao_id: gatewayPaymentId
    }
  });

  if (!transacao) {
    console.error(`❌ Transação não encontrada: ${gatewayPaymentId}`);
    return;
  }

  if (['aprovada', 'concluida'].includes(transacao.status)) {
    console.log(`ℹ️  Transação já processada: ${transacao.id}`);
    return;
  }

  const claimed = await prisma.transacao.updateMany({
    where: {
      id: transacao.id,
      tenant_id: tenantId,
      status: { in: ['pendente', 'processando'] }
    },
    data: {
      status: 'concluida',
      gateway_resposta: JSON.stringify(paymentData),
      processado_em: new Date()
    }
  });

  if (claimed.count !== 1) return;

  // Atualizar carteiras
  await atualizarCarteiras(exigirPartes(transacao));

  console.log(`✅ Pagamento processado: ${transacao.id}`);
}

async function processarPagamentoFalhou(tenantId: string, paymentData: DadosDoPagamentoNoEvento) {
  const gatewayPaymentId = idDoGateway(paymentData.gateway_payment_id, paymentData.id);

  console.log(`❌ Processando pagamento rejeitado: ${gatewayPaymentId}`);

  const transacao = await prisma.transacao.findFirst({
    where: {
      tenant_id: tenantId,
      gateway_transacao_id: gatewayPaymentId
    }
  });

  if (!transacao) {
    console.error(`❌ Transação não encontrada: ${gatewayPaymentId}`);
    return;
  }

  await prisma.transacao.updateMany({
    where: {
      id: transacao.id,
      tenant_id: tenantId,
      status: { in: ['pendente', 'processando'] }
    },
    data: {
      status: 'falhou',
      gateway_resposta: JSON.stringify(paymentData),
      processado_em: new Date()
    }
  });

  console.log(`✅ Pagamento rejeitado registrado: ${transacao.id}`);
}

// Nenhum evento chama `processarEstorno` hoje (o switch só trata `payment`);
// fica como estava, à espera do evento de estorno.
async function processarEstorno(tenantId: string, paymentData: DadosDoPagamentoNoEvento) {
  const gatewayPaymentId = idDoGateway(paymentData.gateway_payment_id, paymentData.payment_intent, paymentData.id);

  console.log(`🔄 Processando estorno: ${gatewayPaymentId}`);

  const transacao = await prisma.transacao.findFirst({
    where: {
      tenant_id: tenantId,
      gateway_transacao_id: gatewayPaymentId
    }
  });

  if (!transacao) {
    console.error(`❌ Transação não encontrada: ${gatewayPaymentId}`);
    return;
  }

  const claimed = await prisma.transacao.updateMany({
    where: {
      id: transacao.id,
      tenant_id: tenantId,
      status: { in: ['aprovada', 'concluida'] }
    },
    data: {
      status: 'estornada',
      gateway_resposta: JSON.stringify(paymentData)
    }
  });

  if (claimed.count !== 1) return;

  // Reverter carteiras
  await reverterCarteiras(exigirPartes(transacao));

  console.log(`✅ Estorno processado: ${transacao.id}`);
}

async function atualizarCarteiras(transacao: TransacaoComPartes) {
  // Atualizar carteira do tutor (débito)
  await prisma.carteiraTutor.upsert({
    where: { tutor_id: transacao.tutor_id },
    create: {
      tenant_id: transacao.tenant_id,
      tutor_id: transacao.tutor_id,
      saldo: 0,
      total_gasto: transacao.valor_tutor
    },
    update: {
      total_gasto: {
        increment: transacao.valor_tutor
      }
    }
  });

  // Atualizar carteira do veterinário (crédito pendente)
  await prisma.carteiraVeterinario.upsert({
    where: { veterinario_id: transacao.veterinario_id },
    create: {
      tenant_id: transacao.tenant_id,
      veterinario_id: transacao.veterinario_id,
      saldo_disponivel: 0,
      saldo_pendente: transacao.valor_veterinario,
      total_recebido: 0
    },
    update: {
      saldo_pendente: {
        increment: transacao.valor_veterinario
      }
    }
  });
}

async function reverterCarteiras(transacao: TransacaoComPartes) {
  // Reverter débito do tutor
  await prisma.carteiraTutor.update({
    where: { tutor_id: transacao.tutor_id },
    data: {
      total_gasto: {
        decrement: transacao.valor_tutor
      }
    }
  });

  // Reverter crédito do veterinário
  await prisma.carteiraVeterinario.update({
    where: { veterinario_id: transacao.veterinario_id },
    data: {
      saldo_pendente: {
        decrement: transacao.valor_veterinario
      }
    }
  });
}

// Mantém o símbolo referenciado: o `.js` também o definia sem chamar.
void processarEstorno;

const webhookController = {
  webhookMercadoPago
};

module.exports = webhookController;

export default webhookController;
export { webhookMercadoPago };
