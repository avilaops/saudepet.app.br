import type { Request, Response } from 'express';
import type { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import paymentService from '../services/payment/payment.service';
import AsaasGateway from '../services/payment/asaas.gateway';
import type { VerificacaoDeWebhook } from '../services/payment/gateway.interface';

const mensagemDe = (erro: unknown): string => (erro instanceof Error ? erro.message : String(erro));

/**
 * `getGateway` devolve a união dos dois provedores, e cada um fala o seu
 * dialeto no `verifyWebhook`. Aqui só o do Mercado Pago interessa; se por
 * algum motivo vier o outro, a verificação conta como recusada — que é o que
 * `!verification.valido` já fazia em JavaScript com um objeto sem esse campo.
 */
const recusaDoMercadoPago = (verification: VerificacaoDeWebhook): { recusado: boolean; erro?: string } => {
  if (!('valido' in verification)) return { recusado: true };
  if (!verification.valido) return { recusado: true, erro: verification.erro };
  return { recusado: false };
};

class WebhookPaymentController {
  /**
   * Webhook do Mercado Pago (fluxo de pagamentos do atendimento).
   * A notificação traz só o id do pagamento; o tenant sai da cobrança local,
   * a assinatura x-signature é validada com o secret do tenant e o status
   * real vem de uma consulta à API — nunca do corpo da notificação.
   */
  handleMercadoPagoWebhook = async (req: Request, res: Response) => {
    try {
      const dataId = req.body?.data?.id || req.query?.['data.id'];
      if (!dataId) {
        // Ping de teste do painel do MP — reconhecer sem processar.
        return res.status(200).json({ received: true });
      }

      const payment = await prisma.payment.findFirst({
        where: { external_payment_id: String(dataId), provider: 'mercado_pago' }
      });
      if (!payment) {
        // Pode ser notificação adiantada ou de outra conta — 200 evita retry infinito.
        console.warn(`⚠️ [WEBHOOK MP] Cobrança ${dataId} não encontrada localmente.`);
        return res.status(200).json({ received: true });
      }

      const gateway = await paymentService.getGateway('mercado_pago', payment.tenant_id);
      const verification = await gateway.verifyWebhook(req);
      const recusa = recusaDoMercadoPago(verification);
      if (recusa.recusado) {
        return res.status(401).json({ success: false, message: recusa.erro });
      }

      res.status(200).json({ received: true });

      const io = req.app.get('io') as SocketServer | undefined;
      const eventId = `mp_${req.headers['x-request-id'] || `${dataId}_${Date.now()}`}`;
      const eventType = String(req.body?.action || req.body?.type || 'payment.updated');

      gateway.getPaymentStatus(String(dataId))
        .then((statusRes) => paymentService.processWebhookEvent({
          provider: 'mercado_pago',
          eventId,
          eventType,
          paymentData: { id: String(dataId), status: statusRes.statusOriginal },
          payload: req.body,
          io
        }))
        .catch((err: unknown) => {
          console.error('❌ Erro no processamento de webhook MP em background:', mensagemDe(err));
        });
    } catch (error) {
      console.error('❌ Erro crítico ao receber webhook do Mercado Pago:', mensagemDe(error));
      return res.status(500).json({ success: false, error: mensagemDe(error) });
    }
  };

  handleAsaasWebhook = async (req: Request, res: Response) => {
    try {
      const gateway = new AsaasGateway();
      const verification = await gateway.verifyWebhook(req);

      if (!verification.valid) {
        return res.status(401).json({ success: false, message: verification.reason });
      }

      // Responder rápido ao gateway
      res.status(200).json({ received: true });

      // Processamento assíncrono idempotente. O `io` precisa ser capturado agora:
      // depois da resposta o handler já não tem mais acesso garantido ao req.
      const io = req.app.get('io') as SocketServer | undefined;

      paymentService.processWebhookEvent({
        provider: 'asaas',
        eventId: verification.eventId,
        eventType: verification.eventType,
        paymentData: verification.paymentData,
        payload: req.body,
        io
      }).catch((err: unknown) => {
        console.error('❌ Erro no processamento de webhook em background:', mensagemDe(err));
      });

    } catch (error) {
      console.error('❌ Erro crítico ao receber webhook do Asaas:', mensagemDe(error));
      return res.status(500).json({ success: false, error: mensagemDe(error) });
    }
  };
}

const webhookPaymentController = new WebhookPaymentController();

module.exports = webhookPaymentController;

export default webhookPaymentController;
