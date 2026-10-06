import type { Request } from 'express';
import type { PaymentMethod, Prisma, StatusPagamento, Usuario } from '@prisma/client';

/**
 * Abstract Payment Gateway Interface
 * Implementa o padrão Strategy para desacoplar a regra de negócio do Saúde PET de provedores específicos (Asaas, Pagar.me, Mercado Pago)
 *
 * Os tipos abaixo descrevem o contrato que os dois provedores concretos
 * (`asaas.gateway.ts` e `mercadopago.gateway.ts`) já cumpriam em JavaScript.
 * Onde os dois divergem — o resultado de `verifyWebhook` fala `valid/reason`
 * no Asaas e `valido/erro` no Mercado Pago — o tipo é a união honesta dos
 * dois dialetos, não um contrato inventado que nenhum deles cumpre.
 */

/** Valor monetário como chega dos chamadores: número, string ou Decimal do Prisma. */
export type Valor = number | string | Prisma.Decimal;

/** O recorte do tutor que os gateways usam para montar o pagador. */
export type DadosDoTutor = Pick<Usuario, 'id' | 'nome' | 'email'> &
  Partial<Pick<Usuario, 'cpf' | 'telefone' | 'cep'>> & {
    /** Só o Asaas lê; nenhum campo de `usuarios` o preenche hoje. */
    asaasCustomerId?: string | null;
  };

export type DadosDoRecebedor = {
  nome: string;
  email?: string | null;
  cpfCnpj?: string | null;
  telefone?: string | null;
  mobilePhone?: string | null;
  dadosBancarios?: unknown;
  tenantId?: string | null;
};

export type RecebedorCriado = {
  accountId: string | null;
  walletId: string;
  status: string;
  observacao?: string;
};

export type StatusDoRecebedor = {
  status: string | undefined;
  accountId?: string;
  walletId?: string;
};

export type SplitParaGateway = {
  recipientType: string;
  recipientId: string;
  providerRecipientId: string | null;
  recipientAmount: number;
  percentage?: number;
};

export type DadosDoCartao = {
  /** Mercado Pago: parcelas escolhidas no navegador. */
  installments?: number | string;
  /** Asaas: cartão em claro (fluxo legado, hoje sem credencial em produção). */
  holderName?: string;
  number?: string;
  expiryMonth?: string;
  expiryYear?: string;
  ccv?: string;
};

export type CriarCobrancaInput = {
  externalId: string;
  amount: Valor;
  method: PaymentMethod | string;
  tutor: DadosDoTutor;
  description?: string | null;
  splits?: SplitParaGateway[];
  cardToken?: string | null;
  cardDetails?: DadosDoCartao | null;
};

export type CobrancaCriada = {
  externalPaymentId: string;
  status: StatusPagamento;
  pixCopyPaste: string | null;
  pixQrCodeRef: string | null;
  expiresAt: Date | null;
};

export type StatusDaCobranca = {
  externalPaymentId: string;
  status: StatusPagamento;
  paidAt: Date | null;
  /** Status bruto do provedor (só o Mercado Pago devolve). */
  statusOriginal?: string;
  externalReference?: string | null;
};

export type CobrancaCancelada = {
  status: StatusPagamento;
  success?: boolean;
  externalPaymentId?: string;
};

export type EstornoSolicitado = {
  refundId: string;
  status: StatusPagamento;
  amount?: number;
};

/** Dialeto do Asaas. */
export type VerificacaoWebhookAsaas =
  | { valid: false; reason: string }
  | { valid: true; eventId: string; eventType: string; paymentData: DadosDoPagamentoNoWebhook };

/** Dialeto do Mercado Pago. */
export type VerificacaoWebhookMercadoPago =
  | { valido: false; erro: string }
  | { valido: true; tipo: string | undefined; paymentId: string | null };

export type VerificacaoDeWebhook = VerificacaoWebhookAsaas | VerificacaoWebhookMercadoPago;

/** O trecho do payload de webhook que `processWebhookEvent` lê. */
export type DadosDoPagamentoNoWebhook = {
  id?: string | null;
  status?: string | null;
  externalReference?: string | null;
  [chave: string]: unknown;
};

class PaymentGatewayInterface {
  /**
   * Criar subconta / recebedor no gateway
   * @param data - { nome, email, cpfCnpj, telefone, dadosBancarios, tenantId }
   */
  async createRecipient(data: DadosDoRecebedor): Promise<RecebedorCriado> {
    throw new Error('Método createRecipient() deve ser implementado pelo provedor');
  }

  /**
   * Consultar status do recebedor/subconta no gateway
   */
  async getRecipientStatus(recipientId: string): Promise<StatusDoRecebedor> {
    throw new Error('Método getRecipientStatus() deve ser implementado pelo provedor');
  }

  /**
   * Criar cobrança no gateway (PIX ou Cartão) com regras de split
   * @param data - { externalId, amount, method, tutor, description, splits, cardToken }
   */
  async createPayment(data: CriarCobrancaInput): Promise<CobrancaCriada> {
    throw new Error('Método createPayment() deve ser implementado pelo provedor');
  }

  /**
   * Consultar status de uma cobrança no gateway
   */
  async getPaymentStatus(externalPaymentId: string): Promise<StatusDaCobranca> {
    throw new Error('Método getPaymentStatus() deve ser implementado pelo provedor');
  }

  /**
   * Cancelar cobrança pendente
   */
  async cancelPayment(externalPaymentId: string): Promise<CobrancaCancelada> {
    throw new Error('Método cancelPayment() deve ser implementado pelo provedor');
  }

  /**
   * Solicitar estorno integral ou parcial de pagamento
   */
  async refundPayment(
    externalPaymentId: string,
    amount?: Valor | null,
    reason?: string | null
  ): Promise<EstornoSolicitado> {
    throw new Error('Método refundPayment() deve ser implementado pelo provedor');
  }

  /**
   * Verificar autenticidade e integridade do Webhook enviado pelo gateway
   * @param req - Objeto de requisição do Express
   */
  async verifyWebhook(req: Request): Promise<VerificacaoDeWebhook> {
    throw new Error('Método verifyWebhook() deve ser implementado pelo provedor');
  }
}

module.exports = PaymentGatewayInterface;

export default PaymentGatewayInterface;
