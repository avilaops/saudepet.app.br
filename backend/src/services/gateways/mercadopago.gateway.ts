import axios, { type AxiosInstance } from 'axios';
import crypto from 'crypto';
import AbstractGateway, { type ConfiguracaoDoGateway, type FalhaDoGateway } from './abstract.gateway';

/** Metadados livres que o chamador anexa à preferência/assinatura. */
type Metadados = Record<string, unknown> & {
  descricao?: string;
  back_urls?: Record<string, string>;
  external_reference?: string;
  notification_url?: string;
  email?: string;
  back_url?: string;
};

type DadosDoCliente = {
  email?: string;
  nome?: string;
  telefone?: string;
  cpf?: string;
  metadata?: { descricao?: string };
};

type ContextoDeAssinatura = {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string | number;
};

export type PreferenciaCriada = {
  success: true;
  gateway_payment_id: string;
  init_point: string;
  sandbox_init_point: string;
  status: 'pending';
  amount: number;
  currency: string;
};

export type StatusDoPagamento = {
  success: true;
  gateway_payment_id: string | number;
  status: string;
  amount: number;
  currency: string;
  created_at: Date;
};

export type VerificacaoDeWebhook =
  | { success: true; event_type: string | undefined; event_data: unknown }
  | FalhaDoGateway;

/**
 * Implementação do gateway Mercado Pago
 * Documentação: https://www.mercadopago.com.br/developers/pt/reference
 */
class MercadoPagoGateway extends AbstractGateway {
  /** O axios criado no construtor: nesta classe `client` nunca fica nulo. */
  declare client: AxiosInstance;

  constructor(config: ConfiguracaoDoGateway) {
    super(config);

    const baseURL = config.ambiente === 'production'
      ? 'https://api.mercadopago.com'
      : 'https://api.mercadopago.com'; // Mercado Pago usa mesma URL para sandbox

    this.client = axios.create({
      baseURL,
      headers: {
        'Authorization': `Bearer ${config.secret_key}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': this.generateIdempotencyKey()
      }
    });
  }

  generateIdempotencyKey(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  /**
   * Criar preferência de pagamento (equivalente a Payment Intent)
   */
  override async createPaymentIntent(amount: number, currency = 'BRL', metadata: Metadados = {}): Promise<PreferenciaCriada | FalhaDoGateway> {
    try {
      const response = await this.client.post('/checkout/preferences', {
        items: [{
          title: metadata.descricao || 'Pagamento',
          quantity: 1,
          unit_price: amount,
          currency_id: currency
        }],
        back_urls: metadata.back_urls || {},
        auto_return: 'approved',
        external_reference: metadata.external_reference,
        notification_url: metadata.notification_url,
        metadata: metadata
      });

      return {
        success: true,
        gateway_payment_id: response.data.id,
        init_point: response.data.init_point, // URL para redirect
        sandbox_init_point: response.data.sandbox_init_point,
        status: 'pending',
        amount,
        currency
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Consultar pagamento
   */
  // `string | number | undefined` porque o webhook repassa `data.id` como veio
  // na notificação — o template literal da URL já convertia o que chegasse.
  override async getPaymentStatus(paymentId: string | number | undefined): Promise<StatusDoPagamento | FalhaDoGateway> {
    try {
      const response = await this.client.get(`/v1/payments/${paymentId}`);
      const payment = response.data;

      return {
        success: true,
        gateway_payment_id: payment.id,
        status: this.mapMPStatus(payment.status),
        amount: payment.transaction_amount,
        currency: payment.currency_id,
        created_at: new Date(payment.date_created)
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Capturar pagamento (Mercado Pago não usa captura explícita)
   */
  override async capturePayment(paymentId: string): Promise<StatusDoPagamento | FalhaDoGateway> {
    return await this.getPaymentStatus(paymentId);
  }

  /**
   * Cancelar pagamento
   */
  override async cancelPayment(paymentId: string) {
    try {
      const response = await this.client.put(`/v1/payments/${paymentId}`, {
        status: 'cancelled'
      });

      return {
        success: true as const,
        gateway_payment_id: response.data.id as string | number,
        status: 'cancelled' as const
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Reembolsar pagamento
   */
  override async refundPayment(paymentId: string, amount: number | null = null) {
    try {
      const refundData = amount ? { amount } : {};

      const response = await this.client.post(
        `/v1/payments/${paymentId}/refunds`,
        refundData
      );

      return {
        success: true as const,
        refund_id: response.data.id as string | number,
        status: response.data.status as string,
        amount: response.data.amount as number
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Criar cliente
   */
  override async createCustomer(customerData: DadosDoCliente) {
    try {
      const response = await this.client.post('/v1/customers', {
        email: customerData.email,
        first_name: customerData.nome?.split(' ')[0],
        last_name: customerData.nome?.split(' ').slice(1).join(' '),
        phone: {
          area_code: customerData.telefone?.substring(0, 2),
          number: customerData.telefone?.substring(2)
        },
        identification: customerData.cpf ? {
          type: 'CPF',
          number: customerData.cpf
        } : undefined,
        description: customerData.metadata?.descricao
      });

      return {
        success: true as const,
        gateway_customer_id: response.data.id as string | number,
        email: response.data.email as string
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Criar assinatura
   */
  override async createSubscription(customerId: string, planId: string, metadata: Metadados = {}) {
    try {
      const response = await this.client.post('/preapproval', {
        preapproval_plan_id: planId,
        payer_email: metadata.email,
        external_reference: metadata.external_reference,
        back_url: metadata.back_url,
        status: 'authorized'
      });

      return {
        success: true as const,
        subscription_id: response.data.id as string,
        status: response.data.status as string,
        init_point: response.data.init_point as string
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Cancelar assinatura
   */
  override async cancelSubscription(subscriptionId: string) {
    try {
      const response = await this.client.put(`/preapproval/${subscriptionId}`, {
        status: 'cancelled'
      });

      return {
        success: true as const,
        subscription_id: response.data.id as string,
        status: response.data.status as string,
        canceled_at: new Date()
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Verificar webhook
   */
  override async verifyWebhook(payload: string | { type?: string; data?: { id?: string | number } }, signatureContext: ContextoDeAssinatura = {}): Promise<VerificacaoDeWebhook> {
    // Manifesto oficial: id:<data.id>;request-id:<x-request-id>;ts:<ts>;
    // A consulta posterior do pagamento complementa, mas não substitui, a
    // autenticacao HMAC da notificacao recebida.
    try {
      const notificacao: { type?: string; data?: { id?: string | number } } =
        typeof payload === 'string' ? JSON.parse(payload) : payload;
      const { xSignature, xRequestId, dataId } = signatureContext;
      const secret = this.config.webhook_secret;
      if (!xSignature || !xRequestId || !dataId || !secret) {
        return { success: false, error: 'Webhook signature data missing' };
      }

      const signatureParts: Record<string, string | undefined> = Object.fromEntries(
        String(xSignature).split(',').map((part) => {
          const [chave, valor] = part.trim().split('=', 2);
          return [chave, valor] as const;
        })
      );
      if (!signatureParts.ts || !signatureParts.v1 || !/^[a-f0-9]{64}$/i.test(signatureParts.v1)) {
        return { success: false, error: 'Webhook signature malformed' };
      }

      const manifest = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${signatureParts.ts};`;
      const calculated = crypto.createHmac('sha256', secret).update(manifest).digest('hex');
      const expectedBuffer = Buffer.from(calculated, 'hex');
      const receivedBuffer = Buffer.from(signatureParts.v1, 'hex');
      if (expectedBuffer.length !== receivedBuffer.length ||
          !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)) {
        return { success: false, error: 'Webhook signature verification failed' };
      }

      if (notificacao.type === 'payment') {
        const paymentId = notificacao.data?.id;
        const payment = await this.getPaymentStatus(paymentId);

        if (!payment.success) return payment;

        return {
          success: true,
          event_type: notificacao.type,
          event_data: payment
        };
      }

      return {
        success: true,
        event_type: notificacao.type,
        event_data: notificacao.data
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook verification failed',
        details: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Testar conexão
   */
  override async testConnection() {
    try {
      const response = await this.client.get('/v1/payment_methods');

      return {
        success: true as const,
        message: 'Conexão Mercado Pago OK',
        payment_methods_count: response.data.length as number
      };
    } catch (error) {
      return this.handleError(error);
    }
  }

  /**
   * Mapear status do Mercado Pago para padrão interno
   */
  mapMPStatus(mpStatus: string): string {
    const statusMap: Record<string, string> = {
      'pending': 'pendente',
      'approved': 'aprovada',
      'authorized': 'aprovada',
      'in_process': 'processando',
      'in_mediation': 'em_mediacao',
      'rejected': 'rejeitada',
      'cancelled': 'cancelada',
      'refunded': 'estornada',
      'charged_back': 'estornada'
    };

    return statusMap[mpStatus] || mpStatus;
  }
}

module.exports = MercadoPagoGateway;

export default MercadoPagoGateway;
