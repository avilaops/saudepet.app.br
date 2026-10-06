import type { Request, Response } from 'express';
import type { StatusPagamento, TipoAtendimento } from '@prisma/client';
import paymentService from '../services/payment/payment.service';
import PaymentGatewayService from '../services/payment-gateway.service';
import prisma from '../config/database';
import { calcularBeneficio, resumoDoBeneficio } from '../services/beneficio-assinatura.service';
import { NotFoundError, ValidationError, asyncHandler } from '../middleware/error.middleware';

/** Status em que uma cobrança ainda vale (ou já valeu) para o atendimento. */
const STATUS_VIGENTES: StatusPagamento[] = ['PAID', 'CREATED', 'PENDING', 'PROCESSING', 'AUTHORIZED'];

class PaymentController {
  // Preço padrão por tipo quando a cidade não tem tabela própria — os mesmos
  // defaults do cadastro de cidades no painel admin.
  // Último recurso, quando a cidade não está cadastrada. A tabela real é a da
  // cidade — estes números só evitam que um chamado nasça sem preço.
  static PRECO_PADRAO: Record<TipoAtendimento, number> = {
    emergencia: 150,
    consulta_domiciliar: 150,
    teleorientacao: 80,
    vacinacao: 120,
    avaliacao: 120,
    consulta_rotina: 130
  };

  /**
   * Chave pública do gateway, para o navegador tokenizar o cartão.
   *
   * O checkout capturava número e CVV em estado do React e mandava tudo para
   * a NOSSA API — que nem usa esses campos: o gateway exige o token gerado
   * pelo SDK no navegador e recusa o pagamento sem ele. Ou seja, o cartão não
   * funcionava E os dados trafegavam para o nosso servidor à toa, podendo
   * parar em log. A chave pública é feita para ficar exposta no cliente; a
   * secreta nunca sai daqui.
   */
  chavePublica = asyncHandler(async (req: Request, res: Response) => {
    const service = new PaymentGatewayService();

    try {
      // Chamava `service.getGatewayConfig(tenantId, 'mercadopago')`: o método
      // nunca existiu (é `getTenantGatewayConfig`) e 'mercadopago' não é um
      // `GatewayTipo` ('mercado_pago'). Caía sempre no catch abaixo, e o cartão
      // ficava indisponível mesmo com a chave pública cadastrada.
      const config = await service.getTenantGatewayConfig(String(req.tenantId), 'mercado_pago');
      return res.json({
        gateway: 'mercadopago',
        ambiente: config.ambiente,
        public_key: config.public_key || null,
        // Sem chave pública não há como tokenizar: a tela esconde o cartão em
        // vez de oferecer um caminho que falharia no fim.
        cartao_disponivel: Boolean(config.public_key && config.ativo)
      });
    } catch {
      return res.json({ gateway: 'mercadopago', public_key: null, cartao_disponivel: false });
    }
  });

  // Criar intenção de pagamento no Checkout
  createCheckout = asyncHandler(async (req: Request, res: Response) => {
    // `cardToken` é o que o SDK do gateway devolve no navegador. Número e CVV
    // NÃO são aceitos aqui: dado de cartão não deve tocar o nosso servidor.
    const { atendimentoId, method = 'PIX', cardToken, parcelas } = req.body;
    const tutorId = String(req.userId);
    const tenantId = String(req.tenantId);

    if (!atendimentoId) {
      throw new ValidationError('Informe o atendimento a pagar.');
    }

    if (method === 'CREDIT_CARD' && !cardToken) {
      throw new ValidationError('Pagamento com cartão exige o token gerado no navegador.');
    }

    // Se o veterinário já gerou a cobrança do atendimento, o tutor paga aquela —
    // gerar outra criaria duas cobranças abertas para o mesmo serviço, com valores
    // possivelmente diferentes.
    const existente = await prisma.payment.findFirst({
      where: {
        tenant_id: tenantId,
        atendimento_id: String(atendimentoId),
        tutor_id: tutorId,
        status: { in: STATUS_VIGENTES }
      },
      orderBy: { criado_em: 'desc' }
    });

    if (existente) {
      return res.json({ success: true, reaproveitada: true, payment: existente });
    }

    // O preço NUNCA vem do navegador (o cliente mandava amount e a API
    // aceitava qualquer valor): sem cobrança do veterinário, vale a tabela
    // de preços da cidade do atendimento, com o padrão do tipo como último
    // recurso.
    // A cidade vem do TUTOR: `Solicitacao` não tem esse campo, e selecioná-lo
    // derrubava todo o checkout com erro de validação do Prisma — PIX e cartão.
    const atendimento = await prisma.solicitacao.findFirst({
      where: { id: String(atendimentoId), tenant_id: tenantId, tutor_id: tutorId },
      select: { id: true, tipo_atendimento: true, tutor: { select: { cidade: true } } }
    });

    if (!atendimento) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    const cidadeDoAtendimento = atendimento.tutor?.cidade || null;

    let amount: number | null = null;
    if (cidadeDoAtendimento) {
      const cidade = await prisma.cidadeCobertura.findFirst({
        where: { tenant_id: tenantId, nome: { equals: cidadeDoAtendimento, mode: 'insensitive' }, ativo: true }
      });
      if (cidade) {
        const porTipo = {
          emergencia: cidade.preco_emergencia,
          consulta_domiciliar: cidade.preco_domiciliar,
          teleorientacao: cidade.preco_teleorientacao,
          vacinacao: cidade.preco_vacinacao,
          avaliacao: cidade.preco_avaliacao,
          consulta_rotina: cidade.preco_consulta_rotina
        };
        amount = Number(porTipo[atendimento.tipo_atendimento]) || null;
      }
    }
    if (!amount) {
      amount = PaymentController.PRECO_PADRAO[atendimento.tipo_atendimento] || 150;
    }

    // Benefício do plano. `limite_atendimentos` estava gravado e nunca era
    // aplicado: é quantos atendimentos do mês recebem o desconto do plano — não
    // é teto de atendimento (o tutor sempre pode chamar) nem consulta grátis.
    // O tipo importa: o plano VIP cobre teleorientação inteira e a primeira
    // vacinação do ano, que são benefícios à parte do desconto percentual.
    const beneficio = await calcularBeneficio({
      tenantId,
      tutorId,
      precoCheio: amount,
      tipoAtendimento: atendimento.tipo_atendimento
    });

    const payment = await paymentService.createPaymentIntent({
      tenantId,
      atendimentoId: String(atendimentoId),
      tutorId,
      // Dívida conhecida: `method` vem do body sem validar contra
      // `PaymentMethod` — um valor fora do enum é recusado pelo Prisma (500).
      method: String(method),
      amount: beneficio.valor_a_pagar,
      cardToken: typeof cardToken === 'string' ? cardToken : undefined,
      cardDetails: parcelas ? { installments: Number(parcelas) } : undefined,
      beneficio
    });

    return res.status(201).json({
      success: true,
      payment,
      beneficio
    });
  });

  /**
   * Benefício do plano do tutor
   * GET /api/v1/payments/meu-beneficio
   *
   * A vitrine do plano promete "10% de desconto em todas as consultas" e o
   * tutor não tinha onde ver se o benefício estava valendo nem quanto ainda
   * restava no mês.
   */
  meuBeneficio = asyncHandler(async (req: Request, res: Response) => {
    const resumo = await resumoDoBeneficio({ tenantId: String(req.tenantId), tutorId: String(req.userId) });
    return res.json({ success: true, ...resumo });
  });

  // Cobrança vigente de um atendimento. Sem isso o tutor abriria o checkout e
  // criaria uma segunda cobrança, ignorando o valor que o veterinário definiu.
  getPaymentByAtendimento = asyncHandler(async (req: Request, res: Response) => {
    const atendimentoId = String(req.params.atendimentoId);
    const tenantId = String(req.tenantId);

    const atendimento = await prisma.solicitacao.findFirst({
      where: { id: atendimentoId, tenant_id: tenantId },
      include: { veterinario: { select: { usuario_id: true } } }
    });

    if (!atendimento) {
      throw new NotFoundError('Atendimento não encontrado');
    }

    const isParticipante = atendimento.tutor_id === req.userId ||
      atendimento.veterinario?.usuario_id === req.userId;

    if (!isParticipante && req.userType !== 'admin') {
      throw new NotFoundError('Atendimento não encontrado');
    }

    const candidatos = await prisma.payment.findMany({
      where: {
        tenant_id: tenantId,
        atendimento_id: atendimentoId,
        status: { in: STATUS_VIGENTES }
      },
      orderBy: { criado_em: 'desc' },
      select: {
        id: true,
        status: true,
        method: true,
        amount: true,
        // O tutor precisa ver que o desconto do plano foi aplicado: preço
        // diferente do de tabela sem explicação parece erro de cobrança.
        preco_cheio: true,
        desconto_valor: true,
        pix_copy_paste: true,
        pix_qr_code_ref: true,
        expires_at: true,
        paid_at: true,
        criado_em: true
      }
    });

    // Um pagamento confirmado encerra o assunto; senão, vale a cobrança aberta mais recente.
    const payment = candidatos.find(item => item.status === 'PAID') || candidatos[0] || null;

    return res.json({ success: true, payment });
  });

  // Consultar status do pagamento.
  // Escopo obrigatório: sem o filtro de tenant + participante, qualquer usuário
  // autenticado conseguia ler a cobrança de qualquer outro só com o UUID.
  getPaymentStatus = asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);

    const payment = await prisma.payment.findFirst({
      where: { id, tenant_id: String(req.tenantId) },
      include: {
        splits: true,
        refunds: true,
        veterinario: { select: { usuario_id: true } }
      }
    });

    if (!payment) {
      throw new NotFoundError('Pagamento não encontrado');
    }

    const isParticipante = payment.tutor_id === req.userId ||
      payment.veterinario?.usuario_id === req.userId;
    const isAdminDoTenant = req.userType === 'admin';

    if (!isParticipante && !isAdminDoTenant) {
      throw new NotFoundError('Pagamento não encontrado');
    }

    const { veterinario, ...dadosPagamento } = payment;

    return res.json({
      success: true,
      payment: dadosPagamento
    });
  });
}

const paymentController = new PaymentController();

module.exports = paymentController;

export default paymentController;
