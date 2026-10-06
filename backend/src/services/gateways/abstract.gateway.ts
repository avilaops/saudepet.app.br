import type { AxiosInstance } from 'axios';

/**
 * As credenciais que chegam ao gateway: a linha de `gateway_configs` já
 * descriptografada (ver `PaymentGatewayService.getTenantGatewayConfig`) ou,
 * nos testes, o literal mínimo com `secret_key` e `webhook_secret`.
 */
export type ConfiguracaoDoGateway = {
  ambiente?: string | null;
  secret_key: string | null;
  public_key?: string | null;
  webhook_secret?: string | null;
  [chave: string]: unknown;
};

/** Resposta padronizada de falha: o que `handleError` devolve. */
export type FalhaDoGateway = {
  success: false;
  error: string;
  code?: number;
  details?: unknown;
};

/** Erro como chega do axios: pode trazer a resposta HTTP do provedor. */
type ErroComResposta = {
  message?: string;
  response?: { status?: number; data?: { message?: string } | unknown };
};

/**
 * Gateway abstrato - Interface que todos os gateways devem implementar
 */
class AbstractGateway {
  config: ConfiguracaoDoGateway;
  client: AxiosInstance | null;

  constructor(config: ConfiguracaoDoGateway) {
    this.config = config;
    this.client = null;
  }

  /**
   * Métodos que DEVEM ser implementados pelas subclasses
   */
  async createPaymentIntent(amount: number, currency?: string, metadata?: Record<string, unknown>): Promise<unknown> {
    throw new Error('createPaymentIntent() deve ser implementado');
  }

  async capturePayment(paymentId: string): Promise<unknown> {
    throw new Error('capturePayment() deve ser implementado');
  }

  async cancelPayment(paymentId: string): Promise<unknown> {
    throw new Error('cancelPayment() deve ser implementado');
  }

  async refundPayment(paymentId: string, amount?: number | null): Promise<unknown> {
    throw new Error('refundPayment() deve ser implementado');
  }

  async getPaymentStatus(paymentId: string): Promise<unknown> {
    throw new Error('getPaymentStatus() deve ser implementado');
  }

  async createCustomer(customerData: Record<string, unknown>): Promise<unknown> {
    throw new Error('createCustomer() deve ser implementado');
  }

  async createSubscription(customerId: string, priceId: string, metadata?: Record<string, unknown>): Promise<unknown> {
    throw new Error('createSubscription() deve ser implementado');
  }

  async cancelSubscription(subscriptionId: string): Promise<unknown> {
    throw new Error('cancelSubscription() deve ser implementado');
  }

  async verifyWebhook(payload: unknown, signature?: unknown): Promise<unknown> {
    throw new Error('verifyWebhook() deve ser implementado');
  }

  async testConnection(): Promise<unknown> {
    throw new Error('testConnection() deve ser implementado');
  }

  /**
   * Helpers comuns
   */
  formatCurrency(amount: number): number {
    // Converter para centavos
    return Math.round(amount * 100);
  }

  parseCurrency(amountInCents: number): number {
    // Converter de centavos para reais
    return amountInCents / 100;
  }

  handleError(error: unknown): FalhaDoGateway {
    const erro: ErroComResposta = typeof error === 'object' && error !== null ? error : {};
    // Erros sem `message` (algo que não é Error foi lançado) viram texto em vez
    // de `undefined` — só isso muda em relação ao JavaScript.
    const mensagem = typeof erro.message === 'string' ? erro.message : String(error);
    console.error(`❌ [${this.constructor.name}] Erro:`, mensagem);

    if (erro.response) {
      // Erro da API do gateway
      const corpo = erro.response.data;
      const mensagemDoProvedor =
        typeof corpo === 'object' && corpo !== null && 'message' in corpo
          ? (corpo as { message?: string }).message
          : undefined;
      return {
        success: false,
        error: mensagemDoProvedor || mensagem,
        code: erro.response.status,
        details: corpo
      };
    }

    return {
      success: false,
      error: mensagem
    };
  }
}

module.exports = AbstractGateway;

export default AbstractGateway;
