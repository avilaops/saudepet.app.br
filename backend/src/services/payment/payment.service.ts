import type { Payment, PaymentMethod, Prisma, Refund, StatusPagamento } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import prisma from '../../config/database';
import AsaasGateway from './asaas.gateway';
import MercadoPagoPaymentGateway from './mercadopago.gateway';
import PaymentGatewayService from '../payment-gateway.service';
import { NotFoundError, ValidationError, ConflictError } from '../../middleware/error.middleware';
import emailService from '../email.service';
import type { DadosDoPagamentoNoWebhook, SplitParaGateway, Valor } from './gateway.interface';

/** Os dois provedores que `getGateway` sabe instanciar. */
export type GatewayDePagamento = AsaasGateway | MercadoPagoPaymentGateway;

/** Desconto do plano do tutor, calculado por `beneficio-assinatura.service`. */
export type BeneficioDaCobranca = {
  preco_cheio?: Valor | null;
  desconto_valor?: Valor | null;
  assinatura_id?: string | null;
};

/** Compra no Saúde Pet Mercado: quem recebe é a loja, não o veterinário. */
export type RecebedorDoMercado = {
  lojaId: string;
  providerRecipientId?: string | null;
  repasse: Valor;
  comissao: Valor;
};

export type CriarIntencaoDePagamentoInput = {
  tenantId: string;
  atendimentoId?: string | null;
  tutorId: string;
  /**
   * `PaymentMethod` do Prisma. Aceita `string` porque `mercado.controller`
   * repassa `req.body.method` em maiúsculas sem validar contra o enum — um
   * valor fora dele é recusado pelo Prisma no `payment.create`.
   */
  method?: PaymentMethod | string;
  amount: Valor;
  cardToken?: string | null;
  cardDetails?: { installments?: number | string } | null;
  assinaturaId?: string | null;
  descricao?: string | null;
  beneficio?: BeneficioDaCobranca | null;
  pedidoMercadoId?: string | null;
  recebedorMercado?: RecebedorDoMercado | null;
};

export type ProcessarWebhookInput = {
  provider?: string;
  eventId: string;
  eventType: string;
  paymentData: DadosDoPagamentoNoWebhook;
  payload?: Prisma.InputJsonValue | null;
  io?: SocketServer | null;
  paidAt?: Date | null;
};

export type ResultadoDoWebhook =
  | { status: 'ALREADY_PROCESSED' }
  | { status: 'PAYMENT_NOT_FOUND' }
  | { status: 'SUCCESS'; payment: Payment };

export type EstornarPagamentoInput = {
  paymentId: string;
  amount?: Valor | null;
  reason?: string | null;
  requestedBy?: string | null;
  tenantId?: string | null;
};

type SolicitacaoComVeterinario = Prisma.SolicitacaoGetPayload<{
  include: { veterinario: { include: { usuario: true } } };
}>;

/** Socket.IO registrado em `global.io` pelo server (caminho legado). */
const socketGlobal = (): SocketServer | undefined => (globalThis as { io?: SocketServer }).io;

const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

class PaymentService {
  defaultGateway: AsaasGateway;

  constructor() {
    this.defaultGateway = new AsaasGateway();
  }

  /**
   * Obter instância do gateway apropriado para o tenant.
   *
   * Decisão MP-only: cobranças novas nascem no Mercado Pago, com as
   * credenciais do tenant salvas em gateway_configs (/admin/pagamentos).
   * O Asaas permanece apenas para ler registros históricos.
   */
  async getGateway(provider: string = 'mercado_pago', tenantId: string | null = null): Promise<GatewayDePagamento> {
    if (provider === 'mercado_pago') {
      if (!tenantId) {
        // Sem tenant (ex.: mapeamento de status em webhook) — instância sem
        // credenciais: mapStatus funciona, chamadas de API falham ruidosamente.
        return new MercadoPagoPaymentGateway({});
      }
      const service = new PaymentGatewayService();
      const config = await service.getTenantGatewayConfig(tenantId, 'mercado_pago');
      return new MercadoPagoPaymentGateway(config);
    }
    if (provider === 'asaas') {
      return this.defaultGateway;
    }
    throw new ValidationError(`Provedor de pagamento ${provider} não suportado`);
  }

  /**
   * Criar Intenção de Pagamento e Cobrança com Split
   */
  async createPaymentIntent({ tenantId, atendimentoId, tutorId, method = 'PIX', amount, cardToken, cardDetails, assinaturaId = null, descricao = null, beneficio = null, pedidoMercadoId = null, recebedorMercado = null }: CriarIntencaoDePagamentoInput): Promise<Payment> {
    if (!amount || Number(amount) <= 0) {
      throw new ValidationError('Valor do pagamento deve ser maior que zero');
    }

    const tutor = await prisma.usuario.findUnique({
      where: { id: tutorId }
    });

    if (!tutor) {
      throw new NotFoundError('Tutor não encontrado');
    }

    let solicitacao: SolicitacaoComVeterinario | null = null;
    let veterinario: SolicitacaoComVeterinario['veterinario'] | null = null;

    if (atendimentoId) {
      solicitacao = await prisma.solicitacao.findUnique({
        where: { id: atendimentoId },
        include: { veterinario: { include: { usuario: true } } }
      });

      if (!solicitacao) {
        throw new NotFoundError('Atendimento não encontrado');
      }

      veterinario = solicitacao.veterinario;
    }

    // 💰 Regra de Cálculo de Split Backend
    // A comissão vem da configuração do tenant (painel admin); 15% é só o
    // fallback quando a configuração ainda não existe.
    const configTenant = await prisma.configuracaoTenant.findUnique({
      where: { tenant_id: tenantId },
      select: { comissao_plataforma_pct: true }
    }).catch(() => null);
    const valorBruto = Number(amount);
    const taxaPlataformaPct = configTenant?.comissao_plataforma_pct != null
      ? Number(configTenant.comissao_plataforma_pct) / 100
      : 0.15;

    // Desconto do plano do tutor: quem vende a assinatura é a plataforma, então
    // é a comissão dela que banca o benefício. O repasse do veterinário é
    // calculado sobre o preço CHEIO — ele não vendeu o plano e não tem por que
    // pagar por ele. Descontar do valor bruto cortaria os dois na mesma
    // proporção, tirando dinheiro de quem foi até a casa do animal.
    const precoCheio = beneficio?.preco_cheio != null ? Number(beneficio.preco_cheio) : valorBruto;
    const descontoValor = Math.round(Number(beneficio?.desconto_valor || 0) * 100) / 100;

    const valorLiquidoVet = Math.round((precoCheio - precoCheio * taxaPlataformaPct) * 100) / 100;
    // A comissão é o que sobra depois do repasse. Com desconto maior que a
    // comissão, a plataforma fica com zero — nunca negativo, e nunca à custa do
    // veterinário.
    const taxaPlataformaVal = Math.max(0, Math.round((valorBruto - valorLiquidoVet) * 100) / 100);

    // Compra no Saúde Pet Mercado: a comissão é a da LOJA, calculada no
    // fechamento do pedido. Recalcular aqui pela regra do atendimento daria um
    // número diferente do que o tutor viu na tela e do que o pedido gravou.
    const comissaoDaCobranca = recebedorMercado
      ? Math.round(Number(recebedorMercado.comissao) * 100) / 100
      : taxaPlataformaVal;

    // Verificar Habilitação Financeira do Veterinário
    const splits: SplitParaGateway[] = [];
    let providerRecipientId: string | null = null;

    if (recebedorMercado) {
      // Quem recebe aqui é a loja, não o veterinário. Enquanto ela não tem
      // subconta no gateway, o dinheiro fica retido na plataforma e o repasse
      // sai por Pix — o mesmo caminho já registrado na decisão de 19/08 para o
      // veterinário sem subconta, e o mesmo motivo: split real exigiria
      // onboarding de marketplace no Mercado Pago.
      providerRecipientId = recebedorMercado.providerRecipientId || null;
      splits.push({
        recipientType: 'MERCHANT',
        recipientId: recebedorMercado.lojaId,
        providerRecipientId,
        recipientAmount: Math.round(Number(recebedorMercado.repasse) * 100) / 100
      });
    } else if (veterinario && veterinario.status_financeiro === 'ACTIVE' && veterinario.asaas_wallet_id) {
      providerRecipientId = veterinario.asaas_wallet_id;
      splits.push({
        recipientType: 'VETERINARIAN',
        recipientId: veterinario.id,
        providerRecipientId: veterinario.asaas_wallet_id,
        recipientAmount: valorLiquidoVet,
        percentage: 85
      });
    } else {
      console.warn(`⚠️ Veterinário ${veterinario?.id || 'N/A'} não possui subconta financeira ativa. Split retido na Plataforma.`);
    }

    // Gravar intenção de pagamento inicial no banco
    const idempotencyKey = `sp_pay_${atendimentoId || assinaturaId || 'direct'}_${Date.now()}`;
    const payment = await prisma.payment.create({
      data: {
        tenant_id: tenantId,
        atendimento_id: atendimentoId || null,
        // Cobrança de assinatura: o webhook precisa saber qual assinatura ativar
        // quando o dinheiro entra.
        assinatura_id: assinaturaId || null,
        // Compra no mercado. É por este campo que o webhook encontra o pedido e
        // libera a separação na loja.
        pedido_mercado_id: pedidoMercadoId || null,
        preco_cheio: precoCheio,
        desconto_valor: descontoValor,
        desconto_assinatura_id: descontoValor > 0 ? (beneficio?.assinatura_id || null) : null,
        tutor_id: tutorId,
        veterinario_id: veterinario ? veterinario.id : null,
        provider: 'mercado_pago',
        idempotency_key: idempotencyKey,
        method: method as PaymentMethod,
        amount: valorBruto,
        status: 'CREATED',
        expires_at: new Date(Date.now() + 3600000) // 1 hora de validade
      }
    });

    // Chamar API do Gateway
    const gateway = await this.getGateway('mercado_pago', tenantId);
    const gatewayResponse = await gateway.createPayment({
      externalId: payment.id,
      amount: valorBruto,
      method,
      tutor,
      description: descricao
        || `Atendimento Saúde PET #${solicitacao ? solicitacao.id.slice(0, 8) : payment.id.slice(0, 8)}`,
      splits: splits,
      // O token vem do SDK do gateway rodando no navegador do tutor. Sem
      // repassá-lo, o gateway recusava todo pagamento com cartão — a cadeia
      // parava aqui e o cartão simplesmente não funcionava.
      cardToken,
      cardDetails
    });

    // Atualizar registro no banco com IDs do gateway
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: {
        external_payment_id: gatewayResponse.externalPaymentId,
        status: gatewayResponse.status,
        pix_copy_paste: gatewayResponse.pixCopyPaste,
        pix_qr_code_ref: gatewayResponse.pixQrCodeRef,
        expires_at: gatewayResponse.expiresAt || payment.expires_at
      }
    });

    // Registrar Splits na tabela dedicada
    if (splits.length > 0) {
      await prisma.paymentSplit.createMany({
        data: splits.map(s => ({
          payment_id: payment.id,
          recipient_type: s.recipientType,
          recipient_id: s.recipientId,
          provider_recipient_id: s.providerRecipientId,
          gross_amount: valorBruto,
          platform_fee: comissaoDaCobranca,
          recipient_amount: s.recipientAmount,
          status: 'PENDING'
        }))
      });
    }

    return updatedPayment;
  }

  /**
   * Processar Webhook com Idempotência
   */
  // `io` vem do chamador (req.app.get('io')): o server registra o Socket.IO no app
  // Express, não em global, então ler só de global.io deixava a notificação de
  // pagamento aprovado silenciosamente inerte.
  // `paidAt` existe para a reconciliação: quando o webhook falha e nós só
  // descobrimos o pagamento horas depois, gravar `agora` seria mentira. A hora
  // real da aprovação vem do gateway (`date_approved`), e é ela que precisa
  // ficar registrada — o extrato do veterinário e o fechamento do mês leem
  // este carimbo.
  async processWebhookEvent({ provider = 'asaas', eventId, eventType, paymentData, payload, io = null, paidAt = null }: ProcessarWebhookInput): Promise<ResultadoDoWebhook> {
    // 1. Verificação de Idempotência
    const existingEvent = await prisma.paymentEvent.findUnique({
      where: { external_event_id: eventId }
    });

    if (existingEvent && existingEvent.processing_status === 'PROCESSED') {
      console.log(`ℹ️ [WEBHOOK IDEMPOTENT] Evento ${eventId} já foi processado anteriormente.`);
      return { status: 'ALREADY_PROCESSED' };
    }

    // Logar evento antes do processamento
    const eventLog = await prisma.paymentEvent.upsert({
      where: { external_event_id: eventId },
      update: { attempts: { increment: 1 } },
      create: {
        provider,
        external_event_id: eventId,
        event_type: eventType,
        payload_hash: String(eventId),
        payload: payload || {},
        processing_status: 'PENDING'
      }
    });

    try {
      const externalPaymentId = paymentData.id || paymentData.externalReference;
      if (!externalPaymentId) {
        throw new Error('Identificador de pagamento ausente no payload do webhook');
      }

      // Buscar cobrança local
      const payment = await prisma.payment.findFirst({
        where: {
          OR: [
            { external_payment_id: externalPaymentId },
            { id: externalPaymentId }
          ]
        }
      });

      if (!payment) {
        console.warn(`⚠️ [WEBHOOK] Cobrança não encontrada para ID ${externalPaymentId}`);
        await prisma.paymentEvent.update({
          where: { id: eventLog.id },
          data: { processing_status: 'FAILED', last_error: 'Cobrança não encontrada no banco' }
        });
        return { status: 'PAYMENT_NOT_FOUND' };
      }

      // Mapear status do provedor
      const gateway = await this.getGateway(provider, payment.tenant_id);
      const novoStatus: StatusPagamento = gateway.mapStatus(paymentData.status || eventType);

      const agora = new Date();
      const isPaid = novoStatus === 'PAID';

      // Transição de estado no banco
      const updatedPayment = await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: novoStatus,
          paid_at: isPaid ? (paidAt || agora) : payment.paid_at,
          cancelled_at: novoStatus === 'CANCELLED' || novoStatus === 'EXPIRED' ? agora : payment.cancelled_at
        }
      });

      // Atualizar status de splits para PAID caso o pagamento tenha sido aprovado
      if (isPaid) {
        await prisma.paymentSplit.updateMany({
          where: { payment_id: payment.id },
          data: { status: 'PAID' }
        });

        // Assinatura só vira 'ativa' quando o dinheiro entra. Antes ela nascia
        // ativa direto e a cobrança nunca acontecia: plano pago de graça.
        if (payment.assinatura_id) {
          const proximaCobranca = new Date(agora);
          proximaCobranca.setDate(proximaCobranca.getDate() + 30);

          await prisma.assinaturaUsuario.updateMany({
            where: { id: payment.assinatura_id, tenant_id: payment.tenant_id, status: 'pendente' },
            data: { status: 'ativa', inicio_em: agora, proxima_cobranca: proximaCobranca }
          });
        }

        // Compra no Saúde Pet Mercado: o dinheiro entrou, a loja pode separar.
        // A transição é condicionada ao estado atual lá dentro — o gateway
        // reenvia o mesmo evento, e reprocessá-lo não pode empurrar de novo um
        // pedido que a loja já separou.
        if (payment.pedido_mercado_id) {
          const { marcarComoPago } = await import('../mercado/pedido.service');
          const pedido = await marcarComoPago({
            pedidoId: payment.pedido_mercado_id,
            paymentId: payment.id,
            origem: 'webhook'
          }).catch((erro: unknown) => {
            console.error('❌ [MERCADO] falha ao liberar pedido pago:', mensagemDe(erro));
            return null;
          });

          if (pedido) {
            const { avisarPedidoPago } = await import('../mercado/notificacao-mercado.service');
            avisarPedidoPago(pedido.id).catch(() => {});

            // A tela do Pix fica aberta esperando. Sem este evento ela só
            // descobriria o pagamento no `polling` seguinte — segundos parados
            // olhando um QR code que já foi pago.
            const canal = io || socketGlobal();
            if (canal) {
              const evento = {
                pedidoId: pedido.id,
                codigo: pedido.codigo,
                paymentId: payment.id,
                amount: payment.amount
              };
              canal.to(`user:${payment.tutor_id}`).emit('mercado:pedido_pago', evento);

              const loja = await prisma.lojaMercado.findUnique({
                where: { id: pedido.loja_id },
                select: { responsavel_id: true }
              }).catch(() => null);
              if (loja?.responsavel_id) {
                canal.to(`user:${loja.responsavel_id}`).emit('mercado:pedido_novo', evento);
              }
            }
          }
        }

        // Notificar via Socket.IO. Além da sala do atendimento, avisamos os dois
        // participantes diretamente: o veterinário acompanha as cobranças fora da
        // tela do atendimento e, sem isso, só via o pagamento ao recarregar.
        const socketServer = io || socketGlobal();
        if (socketServer) {
          const evento = {
            paymentId: payment.id,
            atendimentoId: payment.atendimento_id,
            amount: payment.amount,
            paidAt: agora
          };

          if (payment.atendimento_id) {
            socketServer.to(`atendimento:${payment.atendimento_id}`).emit('pagamento:aprovado', evento);
          }

          if (payment.tutor_id) {
            socketServer.to(`user:${payment.tutor_id}`).emit('pagamento:aprovado', evento);
          }

          if (payment.veterinario_id) {
            const vet = await prisma.veterinario.findUnique({
              where: { id: payment.veterinario_id },
              select: { usuario_id: true }
            });
            if (vet?.usuario_id) {
              socketServer.to(`user:${vet.usuario_id}`).emit('pagamento:aprovado', evento);
            }
          }
        }

        // Disparo de e-mail (best-effort)
        const tutor = await prisma.usuario.findUnique({ where: { id: payment.tutor_id } });
        if (tutor && tutor.email) {
          emailService.sendMail({
            to: tutor.email,
            subject: '✅ Pagamento Confirmado - Saúde PET',
            html: `<div style="font-family: sans-serif; padding: 20px; color: #1e293b;">
              <h2 style="color: #10b981;">Pagamento Recebido com Sucesso!</h2>
              <p>Olá, <strong>${tutor.nome}</strong>!</p>
              <p>Confirmamos o recebimento do valor de <strong>R$ ${Number(payment.amount).toFixed(2)}</strong> via PIX/Cartão.</p>
              <p>Seu atendimento presencial está liberado e em andamento com a equipe médica.</p>
            </div>`
          }).catch((e: unknown) => console.error('Erro e-mail pagamento (ignorado):', mensagemDe(e)));
        }
      }

      // Cobrança que morreu (recusada, vencida, cancelada) libera o estoque que
      // o pedido do mercado estava segurando. Sem isso, um cartão recusado
      // deixaria o último item da prateleira reservado até o prazo vencer.
      if (!isPaid && ['FAILED', 'EXPIRED', 'CANCELLED'].includes(novoStatus) && payment.pedido_mercado_id) {
        const { marcarPagamentoFalhou } = await import('../mercado/pedido.service');
        await marcarPagamentoFalhou({
          pedidoId: payment.pedido_mercado_id,
          motivo: `Cobrança ${novoStatus.toLowerCase()} no gateway`
        }).catch((erro: unknown) => {
          console.error('❌ [MERCADO] falha ao liberar estoque de pedido não pago:', mensagemDe(erro));
        });
      }

      // Marcar evento como processado
      await prisma.paymentEvent.update({
        where: { id: eventLog.id },
        data: { processing_status: 'PROCESSED', processed_at: agora }
      });

      return { status: 'SUCCESS', payment: updatedPayment };

    } catch (err) {
      console.error('❌ Erro ao processar webhook:', err);
      await prisma.paymentEvent.update({
        where: { id: eventLog.id },
        data: { processing_status: 'FAILED', last_error: mensagemDe(err) }
      });
      throw err;
    }
  }

  /**
   * Executar Estorno de Pagamento
   */
  async refundPayment({ paymentId, amount, reason, requestedBy, tenantId = null }: EstornarPagamentoInput): Promise<Refund> {
    const payment = await prisma.payment.findFirst({
      // Sem `tenant_id`, um admin estornava o pagamento de outra organização só
      // com o identificador da cobrança.
      where: { id: paymentId, ...(tenantId ? { tenant_id: tenantId } : {}) },
      include: { refunds: true }
    });

    if (!payment) {
      throw new NotFoundError('Pagamento não encontrado');
    }

    if (payment.status !== 'PAID') {
      throw new ConflictError('Apenas pagamentos aprovados podem ser estornados');
    }

    const valorPago = Number(payment.amount);
    // Estorno parcial: o gateway aceita `amount` desde sempre, mas nada aqui
    // conferia se o valor cabia. Dois estornos parciais de 80% devolveriam 160%
    // do que o tutor pagou.
    const jaEstornado = (payment.refunds || [])
      .filter((item) => item.status !== 'FAILED')
      .reduce((soma, item) => soma + Number(item.amount), 0);
    const disponivel = Math.round((valorPago - jaEstornado) * 100) / 100;

    if (disponivel <= 0) {
      throw new ConflictError('Este pagamento já foi totalmente estornado.');
    }

    const pedido = amount === undefined || amount === null ? disponivel : Number(amount);

    if (!Number.isFinite(pedido) || pedido <= 0) {
      throw new ValidationError('Informe um valor de estorno maior que zero.');
    }
    if (pedido > disponivel) {
      throw new ValidationError(
        `O valor excede o que resta estornar (${disponivel.toFixed(2)}).`
      );
    }

    const gateway = await this.getGateway(payment.provider, payment.tenant_id);
    // `external_payment_id` é opcional no modelo; um PAID sem ele iria ao
    // gateway como "null" na URL — o JavaScript já fazia isso.
    const refundResult = await gateway.refundPayment(payment.external_payment_id as string, pedido, reason);

    const valorEstorno = pedido;
    const isTotalRefund = Math.round((jaEstornado + valorEstorno) * 100) / 100 >= valorPago;

    const refundRecord = await prisma.refund.create({
      data: {
        payment_id: payment.id,
        external_refund_id: refundResult.refundId,
        amount: valorEstorno,
        reason: reason || 'Estorno solicitado',
        requested_by: requestedBy,
        status: 'COMPLETED',
        completed_at: new Date()
      }
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: isTotalRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        refunded_at: new Date()
      }
    });

    return refundRecord;
  }
}

const paymentService = new PaymentService();

module.exports = paymentService;

export default paymentService;
