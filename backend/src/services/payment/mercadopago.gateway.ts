import crypto from 'crypto';
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
  type VerificacaoWebhookMercadoPago
} from './gateway.interface';

/** As credenciais do tenant, já descriptografadas por `getTenantGatewayConfig`. */
export type ConfiguracaoMercadoPago = {
  secret_key?: string | null;
  webhook_secret?: string | null;
};

/** `RequestInit` mais a chave de idempotência que o MP exige em POST. */
type OpcoesDeRequisicao = RequestInit & { idempotencyKey?: string };

/** Erro de API com o status HTTP e o corpo devolvido pelo provedor. */
type ErroDoMercadoPago = Error & { statusCode?: number; detalhes?: unknown };

/** O que a API do Mercado Pago devolve nos endpoints que usamos. */
type MpPagamento = {
  id: number | string;
  status: string;
  external_reference?: string | null;
  date_approved?: string | null;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string | null; qr_code_base64?: string | null };
  };
};
type MpBuscaDeClientes = { results?: Array<{ id: number | string }> };
type MpCliente = { id: number | string };
type MpCartao = {
  id: number | string;
  last_four_digits?: string | null;
  expiration_month?: number | null;
  expiration_year?: number | null;
  payment_method?: { id?: string | null; name?: string | null } | null;
};
type MpEstorno = { id: number | string };

/** Corpo da notificação de webhook do Mercado Pago. */
type MpNotificacao = { type?: string; data?: { id?: string | number } };

/**
 * Gateway Mercado Pago do fluxo de pagamentos (PIX/cartão do atendimento).
 *
 * Substitui o Asaas na decisão MP-only do Saúde Pet. Diferença estrutural:
 * o MP só divide pagamento entre contas com onboarding de marketplace
 * (OAuth de cada vendedor), então o split NÃO vai ao gateway — a plataforma
 * recebe 100%, e a divisão 85/15 continua calculada e registrada
 * internamente (PaymentSplit + carteira do veterinário), com repasse via
 * PIX no fluxo de repasses. As credenciais são as do tenant, salvas
 * criptografadas em gateway_configs pela tela /admin/pagamentos.
 */
class MercadoPagoPaymentGateway extends PaymentGatewayInterface {
  accessToken: string | null;
  webhookSecret: string | null;
  baseURL: string;

  constructor(config: ConfiguracaoMercadoPago = {}) {
    super();
    this.accessToken = config.secret_key || null;
    this.webhookSecret = config.webhook_secret || null;
    this.baseURL = 'https://api.mercadopago.com';
  }

  async request<T>(path: string, options: OpcoesDeRequisicao = {}): Promise<T> {
    const response = await fetch(`${this.baseURL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        // Idempotência exigida pelo MP em POST /v1/payments
        ...(options.method === 'POST' ? { 'X-Idempotency-Key': options.idempotencyKey || crypto.randomUUID() } : {}),
        ...options.headers
      } as RequestInit['headers']
    });
    const data = (await response.json().catch(() => ({}))) as T & { message?: string };
    if (!response.ok) {
      const erro: ErroDoMercadoPago = new Error(data.message || `Mercado Pago respondeu ${response.status}`);
      erro.statusCode = response.status;
      erro.detalhes = data;
      throw erro;
    }
    return data;
  }

  /**
   * Sem subconta no modelo interno: o "recebedor" é a carteira interna do
   * veterinário, e o repasse acontece via PIX cadastrado na conta bancária.
   */
  override async createRecipient({ nome }: DadosDoRecebedor): Promise<RecebedorCriado> {
    return {
      walletId: `interno_${crypto.randomUUID()}`,
      accountId: null,
      status: 'ACTIVE',
      observacao: `Carteira interna de ${nome}: repasse via PIX, sem subconta no gateway.`
    };
  }

  override async getRecipientStatus(): Promise<StatusDoRecebedor> {
    return { status: 'ACTIVE' };
  }

  override async createPayment({ externalId, amount, method, tutor, description, cardToken, cardDetails }: CriarCobrancaInput): Promise<CobrancaCriada> {
    if (!this.accessToken) {
      const erro: ErroDoMercadoPago = new Error('Mercado Pago não configurado — cadastre as credenciais em /admin/pagamentos.');
      erro.statusCode = 503;
      throw erro;
    }

    const payer = {
      email: tutor.email,
      first_name: tutor.nome?.split(' ')[0],
      last_name: tutor.nome?.split(' ').slice(1).join(' ') || undefined,
      ...(tutor.cpf ? { identification: { type: 'CPF', number: tutor.cpf.replace(/\D/g, '') } } : {})
    };

    if (method === 'CREDIT_CARD') {
      if (!cardToken) {
        const erro: ErroDoMercadoPago = new Error('Pagamento com cartão exige o token gerado pelo SDK do Mercado Pago no navegador.');
        erro.statusCode = 400;
        throw erro;
      }
      const res = await this.request<MpPagamento>('/v1/payments', {
        method: 'POST',
        idempotencyKey: externalId,
        body: JSON.stringify({
          transaction_amount: Number(amount),
          token: cardToken,
          installments: Number(cardDetails?.installments || 1),
          description,
          external_reference: externalId,
          payer
        })
      });
      return {
        externalPaymentId: String(res.id),
        status: this.mapStatus(res.status),
        pixCopyPaste: null,
        pixQrCodeRef: null,
        expiresAt: null
      };
    }

    // PIX com expiração de 1 hora, como no fluxo anterior
    const expiraEm = new Date(Date.now() + 3600000);
    const res = await this.request<MpPagamento>('/v1/payments', {
      method: 'POST',
      idempotencyKey: externalId,
      body: JSON.stringify({
        transaction_amount: Number(amount),
        payment_method_id: 'pix',
        description,
        external_reference: externalId,
        date_of_expiration: expiraEm.toISOString().replace('Z', '-00:00'),
        payer
      })
    });

    const dadosPix = res.point_of_interaction?.transaction_data || {};
    return {
      externalPaymentId: String(res.id),
      status: this.mapStatus(res.status),
      pixCopyPaste: dadosPix.qr_code || null,
      pixQrCodeRef: dadosPix.qr_code_base64 ? `data:image/png;base64,${dadosPix.qr_code_base64}` : null,
      expiresAt: expiraEm
    };
  }

  /**
   * O cliente do gateway correspondente a este tutor.
   *
   * O Mercado Pago guarda cartão dentro de um "customer", identificado pelo
   * e-mail. Procuramos antes de criar porque a API recusa e-mail repetido — e
   * um tutor que já comprou uma vez cairia em erro na segunda.
   */
  async ensureCustomer({ email, nome, cpf }: { email: string; nome?: string | null; cpf?: string | null }): Promise<string> {
    const busca = await this.request<MpBuscaDeClientes>(`/v1/customers/search?email=${encodeURIComponent(email)}`);
    const existente = busca?.results?.[0];
    if (existente?.id) return String(existente.id);

    const criado = await this.request<MpCliente>('/v1/customers', {
      method: 'POST',
      body: JSON.stringify({
        email,
        first_name: nome?.split(' ')[0],
        last_name: nome?.split(' ').slice(1).join(' ') || undefined,
        ...(cpf ? { identification: { type: 'CPF', number: cpf.replace(/\D/g, '') } } : {})
      })
    });
    return String(criado.id);
  }

  /**
   * Guarda o cartão no cliente do gateway.
   *
   * Recebe o token de uso único que o navegador gerou. O número nunca chega
   * aqui: o que voltamos é a referência e o que serve para a pessoa reconhecer
   * o cartão na lista.
   */
  async saveCard({ customerId, cardToken }: { customerId: string; cardToken: string }): Promise<{
    cardId: string;
    bandeira: string | null;
    ultimosDigitos: string;
    validadeMes: number | null;
    validadeAno: number | null;
  }> {
    const cartao = await this.request<MpCartao>(`/v1/customers/${customerId}/cards`, {
      method: 'POST',
      body: JSON.stringify({ token: cardToken })
    });

    return {
      cardId: String(cartao.id),
      bandeira: cartao.payment_method?.name || cartao.payment_method?.id || null,
      ultimosDigitos: String(cartao.last_four_digits || '????'),
      validadeMes: cartao.expiration_month ?? null,
      validadeAno: cartao.expiration_year ?? null
    };
  }

  async deleteCard({ customerId, cardId }: { customerId: string; cardId: string }): Promise<void> {
    await this.request<unknown>(`/v1/customers/${customerId}/cards/${cardId}`, { method: 'DELETE' });
  }

  override async getPaymentStatus(externalPaymentId: string): Promise<StatusDaCobranca> {
    const res = await this.request<MpPagamento>(`/v1/payments/${externalPaymentId}`);
    return {
      externalPaymentId: String(res.id),
      status: this.mapStatus(res.status),
      // Status bruto do MP: o processamento de webhook mapeia por conta própria.
      statusOriginal: res.status,
      externalReference: res.external_reference || null,
      paidAt: res.date_approved ? new Date(res.date_approved) : null
    };
  }

  override async cancelPayment(externalPaymentId: string): Promise<CobrancaCancelada> {
    const res = await this.request<MpPagamento>(`/v1/payments/${externalPaymentId}`, {
      method: 'PUT',
      body: JSON.stringify({ status: 'cancelled' })
    });
    return { externalPaymentId: String(res.id), status: this.mapStatus(res.status) };
  }

  override async refundPayment(externalPaymentId: string, amount?: Valor | null): Promise<EstornoSolicitado> {
    const res = await this.request<MpEstorno>(`/v1/payments/${externalPaymentId}/refunds`, {
      method: 'POST',
      body: JSON.stringify(amount ? { amount: Number(amount) } : {})
    });
    return { refundId: String(res.id), status: 'PROCESSING' };
  }

  /**
   * Validação oficial do x-signature: manifesto id:<id>;request-id:<rid>;ts:<ts>;
   * assinado com HMAC-SHA256 e comparação em tempo constante — o mesmo esquema
   * já usado no webhook de billing.
   */
  override async verifyWebhook(req: Request): Promise<VerificacaoWebhookMercadoPago> {
    const notificacao: MpNotificacao = req.body || {};
    const dataId: unknown = notificacao.data?.id || req.query?.['data.id'];
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];

    if (!this.webhookSecret) {
      return { valido: false, erro: 'Webhook secret não configurado' };
    }
    if (!xSignature || !xRequestId || !dataId) {
      return { valido: false, erro: 'Cabeçalhos de assinatura ausentes' };
    }

    const partes: Record<string, string | undefined> = Object.fromEntries(
      String(xSignature).split(',').map((parte) => {
        const [chave, valor] = parte.trim().split('=', 2);
        return [chave, valor] as const;
      })
    );
    if (!partes.ts || !partes.v1 || !/^[a-f0-9]{64}$/i.test(partes.v1)) {
      return { valido: false, erro: 'Assinatura malformada' };
    }

    const manifesto = `id:${String(dataId).toLowerCase()};request-id:${xRequestId};ts:${partes.ts};`;
    const calculada = crypto.createHmac('sha256', this.webhookSecret).update(manifesto).digest('hex');
    const esperada = Buffer.from(calculada, 'hex');
    const recebida = Buffer.from(partes.v1, 'hex');
    if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) {
      // Diagnóstico de assinatura recusada. Sem isto, "401" não diz se o
      // problema é o segredo, o manifesto ou um cabeçalho ausente — e o
      // Mercado Pago não mostra o que assinou. NÃO imprime o segredo; imprime
      // o que foi montado e o começo dos dois hashes, que é o bastante para
      // saber QUAL das três coisas está errada.
      console.error('🔴 [MP WEBHOOK] Assinatura recusada:', {
        manifesto,
        ts: partes.ts,
        requestId: xRequestId,
        dataId: String(dataId),
        calculada: calculada.slice(0, 12),
        recebida: partes.v1.slice(0, 12),
        segredoTamanho: this.webhookSecret.length
      });
      return { valido: false, erro: 'Assinatura inválida' };
    }

    return { valido: true, tipo: notificacao.type, paymentId: dataId ? String(dataId) : null };
  }

  mapStatus(statusMp: string): StatusPagamento {
    const mapa: Record<string, StatusPagamento> = {
      pending: 'PENDING',
      in_process: 'PROCESSING',
      in_mediation: 'DISPUTED',
      approved: 'PAID',
      authorized: 'PROCESSING',
      rejected: 'FAILED',
      cancelled: 'EXPIRED',
      refunded: 'REFUNDED',
      partially_refunded: 'PARTIALLY_REFUNDED',
      charged_back: 'DISPUTED'
    };
    return mapa[statusMp] || 'PENDING';
  }
}

module.exports = MercadoPagoPaymentGateway;

export default MercadoPagoPaymentGateway;
