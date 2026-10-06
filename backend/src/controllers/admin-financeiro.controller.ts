import type { Request, Response } from 'express';
import type { PaymentMethod, Prisma, StatusPagamento } from '@prisma/client';
import type { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import paymentService from '../services/payment/payment.service';
import { NotFoundError, ValidationError, ConflictError, asyncHandler } from '../middleware/error.middleware';
import AuditService from '../services/audit.service';
import type { DadosDoPagamentoNoWebhook } from '../services/payment/gateway.interface';

/** Primeiro valor de um parâmetro de query, como string; vazio vira undefined. */
const textoDaQuery = (valor: unknown): string | undefined => {
  if (valor === undefined || valor === null || valor === '') return undefined;
  return String(Array.isArray(valor) ? valor[0] : valor);
};

/** `parseInt` como o JavaScript o aplicava ao valor cru da query. */
const inteiroDaQuery = (valor: unknown, padrao: number): number =>
  parseInt(String(valor ?? padrao));

const ehObjetoJson = (valor: Prisma.JsonValue | undefined): valor is Prisma.JsonObject =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

class AdminFinanceiroController {
  // Relatório de Auditoria Financeira e Conciliação
  getTransacoes = asyncHandler(async (req: Request, res: Response) => {
    const status = textoDaQuery(req.query.status);
    const method = textoDaQuery(req.query.method);
    const search = textoDaQuery(req.query.search);
    const page = inteiroDaQuery(req.query.page, 1);
    const limit = inteiroDaQuery(req.query.limit, 20);
    const skip = (page - 1) * limit;
    const tenantId = String(req.tenantId);

    // Sem `tenant_id` a lista, o total e os logs mostravam o movimento
    // financeiro de TODAS as organizações para o admin de qualquer uma delas.
    const where: Prisma.PaymentWhereInput = { tenant_id: tenantId };
    // Os filtros vão ao Prisma como vieram da URL; fora do enum ele recusa a consulta.
    if (status) where.status = status as StatusPagamento;
    if (method) where.method = method as PaymentMethod;
    // A tela tem campo de busca por ID do pagamento; `search` era desestruturado
    // e nunca usado, então "Buscar" só recarregava a mesma lista.
    if (search) {
      const termo = String(search).trim();
      where.OR = [
        { id: { contains: termo, mode: 'insensitive' } },
        { external_payment_id: { contains: termo, mode: 'insensitive' } }
      ];
    }

    const [total, payments] = await Promise.all([
      prisma.payment.count({ where }),
      prisma.payment.findMany({
        where,
        include: {
          splits: true,
          refunds: true,
          veterinario: { include: { usuario: { select: { nome: true, email: true } } } }
        },
        orderBy: { criado_em: 'desc' },
        skip,
        take: limit
      })
    ]);

    // Calcular Métricas Consolidadas
    const relatorioValores = await prisma.payment.aggregate({
      where: { tenant_id: tenantId, status: 'PAID' },
      _sum: { amount: true },
      _count: { id: true }
    });

    const faturamentoTotalBruto = Number(relatorioValores._sum.amount || 0);

    return res.json({
      success: true,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      resumo: {
        totalAprovados: relatorioValores._count.id,
        faturamentoTotalBruto
      },
      payments
    });
  });

  // Executar Estorno Administrativo de Pagamento
  solicitarEstorno = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const { amount, reason } = req.body;
    const adminId = req.userId;

    if (!reason || String(reason).trim().length < 5) {
      throw new ValidationError('Explique o motivo do estorno — ele fica na trilha financeira.');
    }

    const refundRecord = await paymentService.refundPayment({
      paymentId: id,
      // A tela nunca mandava `amount`, então todo estorno era total, embora o
      // backend e o gateway suportassem parcial desde sempre.
      amount: amount === undefined || amount === null || amount === '' ? undefined : Number(amount),
      reason: String(reason).trim(),
      requestedBy: adminId,
      tenantId: req.tenantId
    });

    // Registrar no Log de Auditoria
    await prisma.auditLog.create({
      data: {
        usuario_id: adminId,
        tenant_id: req.tenantId,
        acao: 'pagamento_estornado',
        recurso: 'payment',
        recurso_id: id,
        detalhes: JSON.stringify({ amount, reason, refundId: refundRecord.id }),
        ip: req.ip,
        user_agent: req.headers['user-agent']
      }
    });

    return res.json({
      success: true,
      message: 'Estorno realizado com sucesso no gateway e registrado no banco',
      refund: refundRecord
    });
  });

  /**
   * Reprocessar um webhook que falhou
   * POST /api/v1/admin/financeiro/webhooks/:id/reprocessar
   *
   * A aba de logs mostrava `PaymentEvent` com `processing_status: FAILED` e não
   * oferecia nada além de olhar: um webhook perdido — o gateway confirmou o
   * pagamento e a nossa ponta falhou — exigia acesso ao banco para consertar,
   * enquanto o tutor via "aguardando pagamento" de algo que ele já pagou.
   */
  reprocessarWebhook = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const evento = await prisma.paymentEvent.findUnique({ where: { id } });

    if (!evento) {
      throw new NotFoundError('Evento de webhook não encontrado');
    }

    if (evento.processing_status === 'PROCESSED') {
      throw new ConflictError('Este evento já foi processado com sucesso.');
    }

    // O payload guardado é o corpo cru do gateway. O identificador do pagamento
    // pode vir em `payment.id` (Mercado Pago) ou na raiz (Asaas).
    const payload: Prisma.JsonObject = ehObjetoJson(evento.payload) ? evento.payload : {};
    const candidato = payload.payment || payload.data || payload;
    const paymentData: DadosDoPagamentoNoWebhook = ehObjetoJson(candidato) ? candidato : payload;

    const resultado = await paymentService.processWebhookEvent({
      provider: evento.provider,
      eventId: evento.external_event_id,
      eventType: evento.event_type,
      paymentData,
      payload,
      io: req.app.get('io') as SocketServer | undefined
    });

    await AuditService.logForensicEvent({
      req,
      tenantId: req.tenantId,
      entityType: 'payment',
      entityId: evento.external_event_id,
      action: 'financeiro.webhook_reprocessado',
      estadoAnterior: { processing_status: evento.processing_status, attempts: evento.attempts },
      estadoPosterior: { resultado: resultado?.status || 'DESCONHECIDO' },
      motivo: 'Reprocessamento manual pela administração'
    });

    return res.json({ success: true, resultado });
  });

  // Consultar Log de Eventos de Webhooks
  getWebhooksLog = asyncHandler(async (req: Request, res: Response) => {
    const status = textoDaQuery(req.query.status);
    const limit = inteiroDaQuery(req.query.limit, 50);
    // `PaymentEvent` não tem tenant: o webhook do gateway chega antes de
    // sabermos a que organização pertence. Fica global de propósito — é log
    // técnico de integração, não movimento financeiro.
    const where: Prisma.PaymentEventWhereInput = {};
    if (status) where.processing_status = status;

    const webhooks = await prisma.paymentEvent.findMany({
      where,
      orderBy: { received_at: 'desc' },
      take: limit
    });

    return res.json({
      success: true,
      webhooks
    });
  });
}

const adminFinanceiroController = new AdminFinanceiroController();

module.exports = adminFinanceiroController;

export default adminFinanceiroController;
