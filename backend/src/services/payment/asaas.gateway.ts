import type { Request } from 'express';
import type { StatusPagamento } from '@prisma/client';
import PaymentGatewayInterface, {
  type CobrancaCancelada,
  type CobrancaCriada,
  type CriarCobrancaInput,
  type DadosDoRecebedor,
  type EstornoSolicitado,
  type RecebedorCriado,
  type StatusDaCobranca,
  type StatusDoRecebedor,
  type Valor,
  type VerificacaoWebhookAsaas
} from './gateway.interface';

export type ConfiguracaoAsaas = {
  apiKey?: string;
  environment?: string;
  webhookSecret?: string;
};

/** O que a API v3 do Asaas devolve nos endpoints que usamos. */
type AsaasErro = { description?: string };
type AsaasResposta = { errors?: AsaasErro[] };
type AsaasConta = { id: string; walletId: string; status?: string };
type AsaasCliente = { id: string };
type AsaasCobranca = { id: string; status: string; dueDate?: string | null; paymentDate?: string | null };
type AsaasPixQrCode = { payload: string | null; encodedImage: string | null };
type AsaasEstorno = { id: string; value?: number };

type AsaasSplit = {
  walletId: string | null;
  fixedValue: number | undefined;
  percentualValue: number | undefined;
};

type AsaasCobrancaPayload = {
  customer: string;
  billingType: 'PIX' | 'CREDIT_CARD';
  value: number;
  dueDate: string;
  description: string;
  externalReference: string;
  split: AsaasSplit[] | undefined;
  creditCard?: {
    holderName?: string;
    number?: string;
    expiryMonth?: string;
    expiryYear?: string;
    ccv?: string;
  };
  creditCardHolderInfo?: {
    name: string;
    email: string;
    cpfCnpj: string;
    postalCode: string;
    addressNumber: string;
    phone: string;
  };
};

/** Corpo do webhook do Asaas: o evento e, dentro dele, a cobrança. */
type AsaasWebhookPayload = {
  id?: string;
  event?: string;
  payment?: { id?: string; status?: string; [chave: string]: unknown };
};

/**
 * Implementação Concreta do Gateway Asaas (v3 API)
 * Suporta Subcontas (BaaS), Cobrança PIX determinística, Cartão Tokenizado e Split Automático
 */
class AsaasGateway extends PaymentGatewayInterface {
  apiKey: string | undefined;
  environment: string;
  webhookSecret: string | undefined;
  baseUrl: string;

  constructor(config: ConfiguracaoAsaas = {}) {
    super();
    this.apiKey = config.apiKey || process.env.ASAAS_API_KEY;
    this.environment = config.environment || process.env.ASAAS_ENVIRONMENT || 'sandbox';
    this.webhookSecret = config.webhookSecret || process.env.ASAAS_WEBHOOK_SECRET;

    this.baseUrl = this.environment === 'production'
      ? 'https://www.asaas.com/api/v3'
      : 'https://sandbox.asaas.com/api/v3';
  }

  /**
   * Sem credencial não há Asaas — e não há resposta.
   *
   * Até 26/08/2026 cada método daqui tinha um desvio "modo de simulação" que,
   * na ausência de `ASAAS_API_KEY`, devolvia sucesso inventado: subconta
   * `mock_acc_…`, cobrança `pay_…` com um PIX copia-e-cola falso,
   * `getPaymentStatus` respondendo PAID e `refundPayment` respondendo
   * REFUNDED. Nada disso tocava dinheiro nenhum.
   *
   * O desvio era invisível para quem estava acima: o tutor via um código PIX na
   * tela, a cobrança era gravada como criada e o estorno de um cancelamento
   * dizia que o dinheiro tinha voltado. A produção nunca teve `ASAAS_API_KEY`
   * — ou seja, o modo padrão era o de mentira, não o de verdade.
   *
   * Agora falta de credencial é erro: quem chamar recebe uma exceção com o nome
   * da operação, e o problema aparece no lugar certo (configuração) em vez de
   * virar um pagamento fantasma no banco.
   */
  exigirCredencial(operacao: string): void {
    if (!this.apiKey) {
      throw new Error(
        `ASAAS_API_KEY não configurada — não é possível ${operacao}. ` +
        'Configure a credencial do Asaas ou use o provedor mercado_pago.'
      );
    }
  }

  /**
   * Helper para chamadas HTTP à API do Asaas
   */
  async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'access_token': this.apiKey,
      ...options.headers
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers: headers as RequestInit['headers']
      });

      const data = (await response.json()) as T & AsaasResposta;
      if (!response.ok) {
        const errorMsg = data.errors ? data.errors.map(e => e.description).join(', ') : 'Erro desconhecido na API Asaas';
        throw new Error(`Asaas API Error (${response.status}): ${errorMsg}`);
      }

      return data;
    } catch (err) {
      console.error(`❌ [Asaas API Exception] ${endpoint}:`, err instanceof Error ? err.message : err);
      throw err;
    }
  }

  /**
   * Criar Subconta / Recebedor no Asaas
   */
  // O Asaas exige CPF/CNPJ para abrir subconta — sem ele a chamada já quebrava
  // no `.replace`; o tipo só torna a exigência visível.
  override async createRecipient({ nome, email, cpfCnpj, telefone, mobilePhone, dadosBancarios }: DadosDoRecebedor & { cpfCnpj: string }): Promise<RecebedorCriado> {
    this.exigirCredencial('criar subconta de recebedor');

    const payload = {
      name: nome,
      email: email,
      cpfCnpj: cpfCnpj.replace(/\D/g, ''),
      mobilePhone: (mobilePhone || telefone || '').replace(/\D/g, ''),
      incomeValue: 5000, // Estimativa inicial
    };

    const res = await this.request<AsaasConta>('/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    return {
      accountId: res.id,
      walletId: res.walletId,
      status: res.status || 'PENDING_DATA'
    };
  }

  /**
   * Consultar status de Subconta
   */
  override async getRecipientStatus(recipientId: string): Promise<StatusDoRecebedor> {
    this.exigirCredencial('consultar o status da subconta');

    const res = await this.request<AsaasConta>(`/accounts/${recipientId}`);
    return {
      accountId: res.id,
      status: res.status,
      walletId: res.walletId
    };
  }

  /**
   * Criar Cobrança com Split no Asaas (PIX ou Cartão)
   */
  override async createPayment({ externalId, amount, method, tutor, description, splits = [], cardToken, cardDetails }: CriarCobrancaInput): Promise<CobrancaCriada> {
    this.exigirCredencial('criar a cobrança');

    // Estruturar dados do Cliente Tutor no Asaas
    let customerId: string;
    if (tutor.asaasCustomerId) {
      customerId = tutor.asaasCustomerId;
    } else {
      const customerRes = await this.request<AsaasCliente>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: tutor.nome,
          cpfCnpj: tutor.cpf ? tutor.cpf.replace(/\D/g, '') : undefined,
          email: tutor.email,
          phone: tutor.telefone ? tutor.telefone.replace(/\D/g, '') : undefined,
          externalReference: tutor.id
        })
      });
      customerId = customerRes.id;
    }

    // Mapear método para Asaas ('PIX', 'CREDIT_CARD')
    const billingType = method === 'CREDIT_CARD' ? 'CREDIT_CARD' : 'PIX';

    // Mapear Splits
    const splitPayload: AsaasSplit[] = splits.map(s => ({
      walletId: s.providerRecipientId,
      fixedValue: s.recipientAmount ? Number(s.recipientAmount) : undefined,
      percentualValue: s.percentage ? Number(s.percentage) : undefined
    }));

    const paymentPayload: AsaasCobrancaPayload = {
      customer: customerId,
      billingType,
      value: Number(amount),
      dueDate: new Date(Date.now() + 3600000).toISOString().split('T')[0], // Hoje + 1 hora
      description: description || 'Atendimento Veterinário Domiciliar Saúde PET',
      externalReference: externalId,
      split: splitPayload.length > 0 ? splitPayload : undefined
    };

    if (billingType === 'CREDIT_CARD' && cardDetails) {
      paymentPayload.creditCard = {
        holderName: cardDetails.holderName,
        number: cardDetails.number,
        expiryMonth: cardDetails.expiryMonth,
        expiryYear: cardDetails.expiryYear,
        ccv: cardDetails.ccv
      };
      paymentPayload.creditCardHolderInfo = {
        name: tutor.nome,
        email: tutor.email,
        cpfCnpj: tutor.cpf ? tutor.cpf.replace(/\D/g, '') : '00000000000',
        postalCode: tutor.cep || '01000000',
        addressNumber: '100',
        phone: tutor.telefone ? tutor.telefone.replace(/\D/g, '') : '11999999999'
      };
    }

    const res = await this.request<AsaasCobranca>('/payments', {
      method: 'POST',
      body: JSON.stringify(paymentPayload)
    });

    let pixCopyPaste: string | null = null;
    let pixQrCodeRef: string | null = null;

    if (billingType === 'PIX') {
      const pixRes = await this.request<AsaasPixQrCode>(`/payments/${res.id}/pixQrCode`);
      pixCopyPaste = pixRes.payload;
      pixQrCodeRef = pixRes.encodedImage;
    }

    return {
      externalPaymentId: res.id,
      status: this.mapStatus(res.status),
      pixCopyPaste,
      pixQrCodeRef,
      expiresAt: res.dueDate ? new Date(res.dueDate) : null
    };
  }

  /**
   * Consultar status de uma cobrança
   */
  override async getPaymentStatus(externalPaymentId: string): Promise<StatusDaCobranca> {
    this.exigirCredencial('consultar o status da cobrança');

    const res = await this.request<AsaasCobranca>(`/payments/${externalPaymentId}`);
    return {
      externalPaymentId: res.id,
      status: this.mapStatus(res.status),
      paidAt: res.paymentDate ? new Date(res.paymentDate) : null
    };
  }

  /**
   * Cancelar cobrança
   */
  override async cancelPayment(externalPaymentId: string): Promise<CobrancaCancelada> {
    this.exigirCredencial('cancelar a cobrança');

    await this.request<unknown>(`/payments/${externalPaymentId}`, {
      method: 'DELETE'
    });
    return { success: true, status: 'CANCELLED' };
  }

  /**
   * Solicitar Estorno
   */
  override async refundPayment(externalPaymentId: string, amount?: Valor | null, reason?: string | null): Promise<EstornoSolicitado> {
    this.exigirCredencial('estornar a cobrança');

    const res = await this.request<AsaasEstorno>(`/payments/${externalPaymentId}/refund`, {
      method: 'POST',
      body: JSON.stringify({
        value: amount ? Number(amount) : undefined,
        description: reason || 'Estorno de atendimento solicitado no Saúde PET'
      })
    });

    return {
      refundId: res.id,
      status: 'REFUNDED',
      amount: res.value
    };
  }

  /**
   * Validar Assinatura do Webhook Asaas
   */
  override async verifyWebhook(req: Request): Promise<VerificacaoWebhookAsaas> {
    const tokenHeader = req.headers['asaas-access-token'];
    const expectedSecret = this.webhookSecret || process.env.ASAAS_WEBHOOK_SECRET;

    // Sem segredo configurado o webhook ficava ABERTO: qualquer POST em
    // /api/webhooks/asaas era aceito como evento legítimo e seguia direto para
    // `processWebhookEvent`, que muda status de pagamento. O caminho do Mercado
    // Pago já exigia assinatura; este não exigia nada.
    if (!expectedSecret) {
      console.warn('⚠️ ASAAS_WEBHOOK_SECRET ausente — webhook do Asaas recusado.');
      return { valid: false, reason: 'Webhook do Asaas não está configurado' };
    }

    if (tokenHeader !== expectedSecret) {
      console.warn('⚠️ Webhook token inválido recebido do Asaas');
      return { valid: false, reason: 'Token de webhook inválido' };
    }

    const payload: AsaasWebhookPayload = req.body;
    return {
      valid: true,
      eventId: payload.id || `evt_${Date.now()}`,
      eventType: payload.event as string,
      paymentData: payload.payment || {}
    };
  }

  /**
   * Mapear status Asaas para StatusPagamento interno
   */
  mapStatus(asaasStatus: string): StatusPagamento {
    const statusMap: Record<string, StatusPagamento> = {
      'PENDING': 'PENDING',
      'RECEIVED': 'PAID',
      'CONFIRMED': 'PAID',
      'RECEIVED_IN_CASH': 'PAID',
      'OVERDUE': 'EXPIRED',
      'REFUNDED': 'REFUNDED',
      'PARTIALLY_REFUNDED': 'PARTIALLY_REFUNDED',
      'REFUND_REQUESTED': 'PROCESSING',
      'CHARGEBACK_REQUESTED': 'DISPUTED',
      'CHARGEBACK_DISPUTE': 'DISPUTED',
      'AWAITING_CHARGEBACK_REVERSAL': 'DISPUTED',
      'DUNNING_REQUESTED': 'PENDING',
      'DUNNING_RECEIVED': 'PAID',
      'AWAITING_RISK_ANALYSIS': 'PROCESSING'
    };

    return statusMap[asaasStatus] || 'PENDING';
  }
}

module.exports = AsaasGateway;

export default AsaasGateway;
